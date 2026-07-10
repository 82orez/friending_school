import "server-only";
import type { createAdminClient } from "@/utils/supabase/admin";

// 과정 라이프사이클 구조적 이벤트 타입(감사 로그 `enrollment_events.event_type`).
// DB enum 대신 앱 레이어 union으로 검증 — 확장 시 마이그레이션 불필요(신규 값 추가만).
export type EnrollmentEventType =
  | "enrollment_created" // 수강신청 생성(실/테스트, detail.isTest)
  | "enrollment_approved" // 강사 승인 → 결제대기
  | "enrollment_rejected" // 강사 거절
  | "payment_confirmed" // admin 입금 확인 → 결제완료 + 클래스 생성
  | "payment_adjusted" // 무통장 결제 실입금액·메모 사후 재조정(매출 반영)
  | "payment_refunded" // 결제 환불(admin/자동/PortOne 취소 웹훅) → 수강 취소
  | "enrollment_cancelled" // 수강신청 취소(학생/admin, actor_role로 구분)
  | "class_postponed" // 개별 수업 연기(보강 생성 O)
  | "class_cancelled" // 개별 수업 취소(보강 없음, admin)
  | "class_reassigned" // 단일 회차 강사 대체
  | "remaining_rescheduled" // 남은 일정 일괄 변경(요일/시간)
  | "remaining_reassigned" // 남은 수업 전체 강사 대체(enrollment 이관)
  | "conducted_overridden"; // 진행여부 수동 보정

export type LogEnrollmentEventInput = {
  enrollmentId?: string | null;
  classId?: string | null;
  eventType: EnrollmentEventType;
  actorId?: string | null;
  actorRole?: "student" | "teacher" | "admin" | "system";
  actorName?: string | null;
  course?: string | null;
  courseTitle?: string | null;
  studentName?: string | null;
  teacherName?: string | null;
  detail?: Record<string, unknown>;
};

// 과정 이벤트 1건 기록(best-effort). service_role insert, 절대 throw 안 함 —
// 로그 실패가 본 뮤테이션(승인·대체·취소 등)을 막지 않도록 호출측 try/catch와 무관하게 자체 방어.
// createMakeupClass와 동일하게 호출측 admin 클라이언트를 받아 재사용.
export async function logEnrollmentEvent(admin: ReturnType<typeof createAdminClient>, input: LogEnrollmentEventInput): Promise<void> {
  try {
    await admin.from("enrollment_events").insert({
      enrollment_id: input.enrollmentId ?? null,
      class_id: input.classId ?? null,
      event_type: input.eventType,
      actor_id: input.actorId ?? null,
      actor_role: input.actorRole ?? null,
      actor_name: input.actorName ?? null,
      course: input.course ?? null,
      course_title: input.courseTitle ?? null,
      student_name: input.studentName ?? null,
      teacher_name: input.teacherName ?? null,
      detail: input.detail ?? null,
    });
  } catch (err) {
    console.error("[logEnrollmentEvent] 실패:", err);
  }
}
