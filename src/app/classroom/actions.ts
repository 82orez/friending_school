"use server";

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { canEnterClass, kstDateMinToMs } from "@/lib/classtime";
import { isValidZoomUrl } from "@/lib/url";

export type EnterResult = { url?: string; error?: string };

// 클래스 입장 — 소유 검증 + 시간창(시작 15분 전~종료) 검증 후 강사 zoom URL(최신값) 반환.
// 학생/강사 모두 사용. URL을 반환하고 클라가 새 탭으로 연다(서버가 시간창 최종 강제).
export async function enterClass(classId: string): Promise<EnterResult> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다. 다시 로그인해 주세요." };

  const id = String(classId ?? "").trim();
  if (!id) return { error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data: cls } = await admin
    .from("classes")
    .select("id, student_id, teacher_id, session_date, start_min, end_min")
    .eq("id", id)
    .maybeSingle();
  if (!cls) return { error: "수업을 찾을 수 없어요." };
  // 소유 검증 — 본인(학생 또는 강사)의 수업만.
  if (cls.student_id !== user.id && cls.teacher_id !== user.id) return { error: "권한이 없습니다." };

  // 시간창 검증(서버 authoritative).
  const startMs = kstDateMinToMs(cls.session_date, cls.start_min);
  const endMs = kstDateMinToMs(cls.session_date, cls.end_min);
  if (!canEnterClass(Date.now(), startMs, endMs)) {
    return { error: "수업 시작 15분 전부터 입장할 수 있어요." };
  }

  // 강사 zoom URL 최신값 조회.
  const { data: teacher } = await admin.from("profiles").select("zoom_url").eq("id", cls.teacher_id).maybeSingle();
  const zoomUrl = (teacher?.zoom_url ?? "").trim();
  if (!zoomUrl || !isValidZoomUrl(zoomUrl)) {
    return { error: "강사의 화상수업 링크가 아직 등록되지 않았어요. 강사에게 문의해 주세요." };
  }

  return { url: zoomUrl };
}
