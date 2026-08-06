"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient, getAdminEmails } from "@/utils/supabase/admin";
import { canCancelClass, canEnterClass, kstDateMinToMs, MAX_CANCELLATIONS } from "@/lib/classtime";
import { fmtTime, lessonEndMin } from "@/lib/availability";
import { isValidZoomUrl } from "@/lib/url";
import { getOrigin } from "@/lib/origin";
import { getCourse } from "@/data/courses";
import { sendClassCancellationToTeacher, sendClassPostponedToAdmin } from "@/lib/mailer";
import { createMakeupClass } from "@/lib/makeup";
import { logEnrollmentEvent } from "@/lib/events";

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
  const { data: cls } = await admin.from("classes").select("id, student_id, teacher_id, session_date, start_min, end_min").eq("id", id).maybeSingle();
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

  // 강사 입장 기록(수업 진행 인정 신호 ① — 첫 입장만, best-effort). 학생 입장은 기록 안 함.
  if (cls.teacher_id === user.id) {
    try {
      await admin.from("classes").update({ teacher_entered_at: new Date().toISOString() }).eq("id", id).is("teacher_entered_at", null);
    } catch (err) {
      console.error("[enterClass] 강사 입장 기록 실패:", err);
    }
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
    .select(
      "id, student_id, teacher_id, enrollment_id, course, course_title, course_english_title, teacher_name, student_name, student_english_name, session_no, session_date, start_min, end_min, status",
    )
    .eq("id", id)
    .maybeSingle();
  if (!cls) return { error: "수업을 찾을 수 없어요." };
  // 소유 검증 — 학생 본인 수업만 취소 가능.
  if (cls.student_id !== user.id) return { error: "권한이 없습니다." };
  if (cls.status !== "예정") return { error: "이미 연기된 수업입니다. 새로고침해 주세요." };

  const now = Date.now();
  const startMs = kstDateMinToMs(cls.session_date, cls.start_min);

  // 다음(가장 이른) 예정 수업 1건만 취소 가능 — 같은 과정의 예정 수업 중 아직 시작 안 한 것들의 최소 시작시각.
  const { data: siblings } = await admin
    .from("classes")
    .select("id, session_date, start_min, end_min")
    .eq("enrollment_id", cls.enrollment_id)
    .eq("status", "예정");
  // 진행 중(입장 가능 창)인 수업이 있으면 다음 수업 연기 불가 — 클라 nextUpcomingId 규칙과 동일.
  const inProgress = (siblings ?? []).some((s) =>
    canEnterClass(now, kstDateMinToMs(s.session_date, s.start_min), kstDateMinToMs(s.session_date, lessonEndMin(s.end_min))),
  );
  if (inProgress) return { error: "진행 중인 수업이 끝난 후에 연기할 수 있어요." };
  const nextId =
    (siblings ?? [])
      .map((s) => ({ id: s.id, ms: kstDateMinToMs(s.session_date, s.start_min) }))
      .filter((s) => s.ms > now)
      .sort((a, b) => a.ms - b.ms)[0]?.id ?? null;
  if (nextId !== id) return { error: "다음 수업만 연기할 수 있어요." };

  if (!canCancelClass(now, startMs)) {
    return { error: "수업 시작 1시간 전까지만 연기할 수 있어요." };
  }

  // 과정(enrollment)당 연기 한도 — 학생 연기(cancel_reason='student')만 집계(회사 사유 연기·취소는 미차감).
  const { count: cancelledCount } = await admin
    .from("classes")
    .select("id", { count: "exact", head: true })
    .eq("enrollment_id", cls.enrollment_id)
    .eq("status", "취소")
    .eq("cancel_reason", "student");
  if ((cancelledCount ?? 0) >= MAX_CANCELLATIONS) {
    return { error: `연기는 과정당 ${MAX_CANCELLATIONS}회까지 가능해요.` };
  }

  // 상태 가드: '예정'일 때만 '취소'로 전환(동시 처리 방지). 학생 연기이므로 cancel_reason='student'.
  const { data: updated, error: updErr } = await admin
    .from("classes")
    .update({ status: "취소", cancel_reason: "student" })
    .eq("id", id)
    .eq("status", "예정")
    .select("id");
  if (updErr) return { error: "연기 처리 중 문제가 발생했어요." };
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

  // 관리자 알림 이메일(best-effort) — 강사 알림과 독립. 보강 자동 생성 실패(makeupDate 없음)는 수동 조치가 필요해 특히 중요.
  try {
    const adminEmails = await getAdminEmails();
    if (adminEmails.length > 0) {
      const origin = getOrigin(await headers());
      await sendClassPostponedToAdmin(adminEmails, {
        studentName: cls.student_name ?? "",
        studentEnglishName: cls.student_english_name ?? "",
        courseTitle: cls.course_title,
        courseEnglishTitle: getCourse(cls.course)?.englishTitle ?? cls.course_english_title ?? "",
        teacherName: cls.teacher_name ?? "",
        sessionDate: cls.session_date,
        sessionTime: `${fmtTime(cls.start_min)}~${fmtTime(lessonEndMin(cls.end_min))}`,
        sessionNo: cls.session_no,
        makeupDate,
        remaining,
        maxCancellations: MAX_CANCELLATIONS,
        adminUrl: `${origin}/admin/classes/${cls.enrollment_id}`,
      });
    }
  } catch (err) {
    console.error("[cancelClass] 관리자 알림 발송 실패:", err);
  }

  await logEnrollmentEvent(admin, {
    enrollmentId: cls.enrollment_id,
    classId: cls.id,
    eventType: "class_postponed",
    actorId: user.id,
    actorRole: "student",
    course: cls.course,
    courseTitle: cls.course_title,
    studentName: cls.student_name,
    teacherName: cls.teacher_name,
    detail: { reason: "student", sessionNo: cls.session_no, sessionDate: cls.session_date, makeupDate: makeupDate ?? null, remaining },
  });

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
  const { data: cls } = await admin
    .from("classes")
    .select("id, teacher_id, session_date, start_min, end_min, status, teacher_entered_at, conducted_at")
    .eq("id", id)
    .maybeSingle();
  if (!cls) return { error: "수업을 찾을 수 없어요." };
  // 작성 권한 — 강사 본인만.
  if (cls.teacher_id !== user.id) return { error: "권한이 없습니다." };
  if (cls.status === "취소") return { error: "연기된 수업에는 피드백을 남길 수 없어요." };

  // 종료 가드 — 레슨 종료 시각(end_min−5) 이후에만.
  const endMs = kstDateMinToMs(cls.session_date, lessonEndMin(cls.end_min));
  if (Date.now() < endMs) return { error: "수업이 끝난 뒤에 작성할 수 있어요." };

  const text = String(feedback ?? "")
    .trim()
    .slice(0, MAX_FEEDBACK_LEN);
  const now = new Date().toISOString();
  // 수업 진행 인정(sticky): 비어있지 않은 피드백 + 강사 입장 기록 있음 + 아직 미인정 → conducted_at 박음.
  const conduct = Boolean(text) && Boolean(cls.teacher_entered_at) && !cls.conducted_at;

  const { error } = await admin
    .from("classes")
    .update({ feedback: text || null, feedback_at: text ? now : null, ...(conduct ? { conducted_at: now } : {}) })
    .eq("id", id);
  if (error) return { error: "저장 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요." };

  revalidatePath("/teacher", "layout");
  revalidatePath("/mypage", "layout");
  revalidatePath("/admin/classes");
  return { ok: true };
}
