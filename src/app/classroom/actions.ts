"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { canCancelClass, canEnterClass, kstDateMinToMs, MAX_CANCELLATIONS } from "@/lib/classtime";
import { fmtTime, lessonEndMin } from "@/lib/availability";
import { isValidZoomUrl } from "@/lib/url";
import { sendClassCancellationToTeacher } from "@/lib/mailer";
import { createMakeupClass } from "@/lib/makeup";

export type EnterResult = { url?: string; error?: string };
export type CancelResult = { ok?: boolean; error?: string; makeupDate?: string; remaining?: number };
export type FeedbackResult = { ok?: boolean; error?: string };

// 피드백 텍스트 최대 길이.
const MAX_FEEDBACK_LEN = 2000;

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
  const endMs = kstDateMinToMs(cls.session_date, lessonEndMin(cls.end_min));
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

  // 자동 보강 생성(best-effort) — 과정 전체 마지막 수업일 다음으로, 주간 스케줄(요일 집합)을 따라 가장 빠른 수업일.
  // 예) 월/수/금·마지막 금요일에서 수요일 취소 → 그 다음 주 월요일. session_no=enrollment 최대+1. (학생·admin 공유)
  const makeupDate = await createMakeupClass(admin, cls);

  // 강사 알림 이메일(best-effort).
  try {
    const { data: teacherUser } = await admin.auth.admin.getUserById(cls.teacher_id);
    const teacherEmail = teacherUser?.user?.email;
    if (teacherEmail) {
      const lessonEnd = lessonEndMin(cls.end_min);
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
  revalidatePath("/admin/classes");
  return { ok: true, makeupDate, remaining };
}

// 수업 피드백 저장(강사) — 본인 소유 + 취소 아님 + 수업 종료(레슨 종료 시각 이후)일 때만.
// 빈 문자열이면 피드백 삭제(null). 수강생은 읽기 전용(여기선 강사만 작성).
export async function saveClassFeedback(classId: string, feedback: string): Promise<FeedbackResult> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다. 다시 로그인해 주세요." };

  const id = String(classId ?? "").trim();
  if (!id) return { error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data: cls } = await admin.from("classes").select("id, teacher_id, session_date, start_min, end_min, status").eq("id", id).maybeSingle();
  if (!cls) return { error: "수업을 찾을 수 없어요." };
  // 작성 권한 — 강사 본인만.
  if (cls.teacher_id !== user.id) return { error: "권한이 없습니다." };
  if (cls.status === "취소") return { error: "취소된 수업에는 피드백을 남길 수 없어요." };

  // 종료 가드 — 레슨 종료 시각(end_min−5) 이후에만.
  const endMs = kstDateMinToMs(cls.session_date, lessonEndMin(cls.end_min));
  if (Date.now() < endMs) return { error: "수업이 끝난 뒤에 작성할 수 있어요." };

  const text = String(feedback ?? "").trim().slice(0, MAX_FEEDBACK_LEN);

  const { error } = await admin
    .from("classes")
    .update({ feedback: text || null, feedback_at: text ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return { error: "저장 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요." };

  revalidatePath("/teacher", "layout");
  revalidatePath("/mypage", "layout");
  return { ok: true };
}
