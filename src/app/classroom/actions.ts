"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { canCancelClass, canEnterClass, kstDateMinToMs, MAX_CANCELLATIONS } from "@/lib/classtime";
import { fmtTime, SLOT_MIN, LESSON_MIN } from "@/lib/availability";
import { isValidZoomUrl } from "@/lib/url";
import { sendClassCancellationToTeacher } from "@/lib/mailer";

export type EnterResult = { url?: string; error?: string };
export type CancelResult = { ok?: boolean; error?: string; makeupDate?: string; remaining?: number };

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

// 'YYYY-MM-DD' 파싱/포맷 (TZ 비종속).
const weekdayOf = (d: string): number => {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).getUTCDay();
};
const addDaysStr = (d: string, days: number): string => {
  const [y, m, day] = d.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, day));
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
};

// 개별 수업 취소(학생) — 본인 소유 + 상태 '예정' + 시작 1시간 전 + 과정당 6회 한도.
// 취소 시 같은 요일/시각 가장 빠른 빈 날짜(그 요일 시리즈 마지막+7일)로 보강 1회 자동 생성. 강사에 이메일 알림(best-effort).
export async function cancelClass(classId: string): Promise<CancelResult> {
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
    .select("id, student_id, teacher_id, enrollment_id, course, course_title, teacher_name, student_name, student_english_name, session_date, start_min, end_min, status")
    .eq("id", id)
    .maybeSingle();
  if (!cls) return { error: "수업을 찾을 수 없어요." };
  // 소유 검증 — 학생 본인 수업만 취소 가능.
  if (cls.student_id !== user.id) return { error: "권한이 없습니다." };
  if (cls.status !== "예정") return { error: "이미 취소된 수업입니다. 새로고침해 주세요." };

  const startMs = kstDateMinToMs(cls.session_date, cls.start_min);
  if (!canCancelClass(Date.now(), startMs)) {
    return { error: "수업 시작 1시간 전까지만 취소할 수 있어요." };
  }

  // 과정(enrollment)당 취소 한도.
  const { count: cancelledCount } = await admin
    .from("classes")
    .select("id", { count: "exact", head: true })
    .eq("enrollment_id", cls.enrollment_id)
    .eq("status", "취소");
  if ((cancelledCount ?? 0) >= MAX_CANCELLATIONS) {
    return { error: `취소는 과정당 ${MAX_CANCELLATIONS}회까지 가능해요.` };
  }

  // 상태 가드: '예정'일 때만 '취소'로 전환(동시 처리 방지).
  const { data: updated, error: updErr } = await admin
    .from("classes")
    .update({ status: "취소" })
    .eq("id", id)
    .eq("status", "예정")
    .select("id");
  if (updErr) return { error: "취소 처리 중 문제가 발생했어요." };
  if (!updated || updated.length === 0) return { error: "이미 처리된 수업입니다. 새로고침해 주세요." };

  // 이번 취소 반영 후 남은 취소 가능 횟수.
  const remaining = Math.max(0, MAX_CANCELLATIONS - ((cancelledCount ?? 0) + 1));

  // 자동 보강 생성(best-effort) — 같은 요일/시각의 마지막 회차 +7일, session_no=enrollment 최대+1.
  let makeupDate: string | undefined;
  try {
    const { data: all } = await admin.from("classes").select("session_no, session_date, start_min").eq("enrollment_id", cls.enrollment_id);
    const rows = (all ?? []) as { session_no: number; session_date: string; start_min: number }[];
    const targetDow = weekdayOf(cls.session_date);
    const sameSeries = rows.filter((r) => r.start_min === cls.start_min && weekdayOf(r.session_date) === targetDow);
    const lastDate = sameSeries.reduce((mx, r) => (r.session_date > mx ? r.session_date : mx), cls.session_date);
    const maxSessionNo = rows.reduce((mx, r) => Math.max(mx, r.session_no), 0);
    makeupDate = addDaysStr(lastDate, 7);
    const { error: insErr } = await admin.from("classes").insert({
      enrollment_id: cls.enrollment_id,
      student_id: cls.student_id,
      teacher_id: cls.teacher_id,
      course: cls.course,
      course_title: cls.course_title,
      teacher_name: cls.teacher_name,
      student_name: cls.student_name,
      student_english_name: cls.student_english_name,
      session_no: maxSessionNo + 1,
      session_date: makeupDate,
      start_min: cls.start_min,
      end_min: cls.end_min,
      is_makeup: true,
    });
    if (insErr) {
      console.error("[cancelClass] 보강 생성 실패:", insErr);
      makeupDate = undefined;
    }
  } catch (err) {
    console.error("[cancelClass] 보강 생성 예외:", err);
    makeupDate = undefined;
  }

  // 강사 알림 이메일(best-effort).
  try {
    const { data: teacherUser } = await admin.auth.admin.getUserById(cls.teacher_id);
    const teacherEmail = teacherUser?.user?.email;
    if (teacherEmail) {
      const lessonEnd = cls.end_min - (SLOT_MIN - LESSON_MIN);
      await sendClassCancellationToTeacher([teacherEmail], {
        studentName: cls.student_english_name || cls.student_name || "Student",
        courseTitle: cls.course_title,
        sessionDate: cls.session_date,
        sessionTime: `${fmtTime(cls.start_min)}~${fmtTime(lessonEnd)}`,
        makeupDate,
      });
    }
  } catch (err) {
    console.error("[cancelClass] 강사 알림 발송 실패:", err);
  }

  revalidatePath("/mypage", "layout");
  revalidatePath("/teacher", "layout");
  return { ok: true, makeupDate, remaining };
}
