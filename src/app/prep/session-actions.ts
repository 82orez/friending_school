"use server";

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { canEnterClass, kstDateMinToMs } from "@/lib/classtime";
import { isMySession } from "@/lib/prep-session";
import { isValidZoomUrl } from "@/lib/url";

// 프렙 회차 입장 — enterRoom(src/app/friending/actions.ts)의 가드 순서를 그대로 따른다.
// ⚠️ enterClass(정규 수업)가 아니라 enterRoom을 본뜬 이유: 프렙은 end_min이 아니라 duration_min
//    모델이라 lessonEndMin(30분 슬롯 → 25분 수업 축소)이 적용되지 않는다.
// ⚠️ zoom_url은 prep_courses에 저장하지 않는다 — 입장 시점에 개설 프렌더 profiles에서 최신값을 읽는다
//    (friender_rooms와 같은 정책. 학생은 profiles_select_own 때문에 클라에서 절대 못 읽는다).

export type EnterPrepResult = { url?: string; error?: string };

export async function enterPrepSession(sessionId: string): Promise<EnterPrepResult> {
  const id = String(sessionId ?? "").trim();
  if (!id) return { error: "잘못된 요청입니다." };

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다. 다시 로그인해 주세요." };

  const admin = createAdminClient();
  const { data: sessionRow } = await admin.from("prep_sessions").select("id, course_id, session_date").eq("id", id).maybeSingle();
  const session = sessionRow as { id: string; course_id: string; session_date: string } | null;
  if (!session) return { error: "수업을 찾을 수 없어요." };

  const { data: courseRow } = await admin
    .from("prep_courses")
    .select("friender_id, start_min, duration_min")
    .eq("id", session.course_id)
    .maybeSingle();
  const course = courseRow as { friender_id: string; start_min: number; duration_min: number } | null;
  if (!course) return { error: "수업을 찾을 수 없어요." };

  // 자격 — 개설 프렌더(호스트) 또는 '수강확정' 수강생.
  // ⚠️ '입금대기'는 거부한다. 프렙에서 자리를 잡는 건 입장이 아니라 돈이다(join_prep_course와 같은 방향).
  const isHost = course.friender_id === user.id;
  if (!isHost) {
    const { data: enroll } = await admin
      .from("prep_enrollments")
      .select("id, first_session_date")
      .eq("course_id", session.course_id)
      .eq("user_id", user.id)
      .eq("status", "수강확정")
      .maybeSingle();
    if (!enroll) return { error: "수강 확정된 수강생만 입장할 수 있어요." };
    // 중도 신청 컷오프 — 결제한 첫 회차보다 앞선 회차는 내 것이 아니다(화면에도 안 보이지만 서버가 authoritative).
    const from = (enroll as { first_session_date: string | null }).first_session_date;
    if (!isMySession(from, session.session_date)) return { error: "수강 시작 전 회차라 입장할 수 없어요." };
  }

  // 시간창 — 서버가 authoritative(클라 버튼 노출은 사전 안내 레이어일 뿐).
  const startMs = kstDateMinToMs(session.session_date, course.start_min);
  const endMs = kstDateMinToMs(session.session_date, course.start_min + course.duration_min);
  if (!canEnterClass(Date.now(), startMs, endMs)) return { error: "시작 15분 전부터 입장할 수 있어요." };

  // 첫 입장 기록 — sticky(이후 입장은 덮어쓰지 않는다). best-effort라 실패해도 입장은 시킨다.
  try {
    if (isHost) {
      await admin.from("prep_sessions").update({ host_entered_at: new Date().toISOString() }).eq("id", session.id).is("host_entered_at", null);
    } else {
      await admin
        .from("prep_attendance")
        .upsert({ session_id: session.id, user_id: user.id }, { onConflict: "session_id,user_id", ignoreDuplicates: true });
    }
  } catch (err) {
    console.error("[prep] 입장 기록 실패:", err);
  }

  const { data: host } = await admin.from("profiles").select("zoom_url").eq("id", course.friender_id).maybeSingle();
  const zoomUrl = ((host as { zoom_url?: string | null } | null)?.zoom_url ?? "").trim();
  if (!zoomUrl || !isValidZoomUrl(zoomUrl)) return { error: "개설자의 화상 링크가 아직 등록되지 않았어요." };

  // ⚠️ revalidate 하지 않는다 — 새 탭을 여는 동작이라 현재 페이지를 갱신할 이유가 없다(enterRoom과 동일).
  return { url: zoomUrl };
}
