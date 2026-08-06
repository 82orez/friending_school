import "server-only";

import { createAdminClient } from "@/utils/supabase/admin";
import { sendClassEventToCenterManager, sendEnrollmentEventToCenterManager, type CenterClassEvent, type CenterEnrollmentEvent } from "@/lib/mailer";

export type { CenterEnrollmentEvent, CenterClassEvent };

export type CenterManagerRecipient = { managerId: string; email: string; centerName?: string };

// 강사(들) → 현재 소속 센터 → 매니저 계정 이메일. managerId 기준 dedupe(같은 매니저가 여러 강사를 담당해도 1통).
// 강사 2명이 서로 다른 센터면 각 매니저가 자기 센터명으로 1통씩 받는다.
// 정산·매출과 동일하게 '현재 소속 센터' 기준(강사 센터 이동 시 과거 건 소급 없음).
export async function loadCenterManagerRecipients(
  admin: ReturnType<typeof createAdminClient>,
  teacherIds: string[],
): Promise<CenterManagerRecipient[]> {
  const ids = Array.from(new Set((teacherIds ?? []).filter(Boolean)));
  if (ids.length === 0) return [];

  const { data: profs } = await admin.from("profiles").select("id, center_id").in("id", ids);
  const centerIds = Array.from(new Set(((profs ?? []) as { center_id: string | null }[]).map((p) => p.center_id).filter(Boolean) as string[]));
  if (centerIds.length === 0) return [];

  const { data: centers } = await admin.from("centers").select("id, name, manager_id").in("id", centerIds);
  const out: CenterManagerRecipient[] = [];
  const seen = new Set<string>();
  for (const c of (centers ?? []) as { id: string; name: string | null; manager_id: string | null }[]) {
    if (!c.manager_id || seen.has(c.manager_id)) continue;
    seen.add(c.manager_id);
    const { data: mgr } = await admin.auth.admin.getUserById(c.manager_id);
    const email = mgr?.user?.email;
    if (email) out.push({ managerId: c.manager_id, email, centerName: c.name ?? undefined });
  }
  return out;
}

// 수신자 필터 — 이메일 제외 목록(관리자 겸직 중복 방지)과 실행 주체 본인(자기가 한 작업) 제거.
function filterRecipients(recipients: CenterManagerRecipient[], excludeEmails?: string[], actorId?: string): CenterManagerRecipient[] {
  const exclude = new Set((excludeEmails ?? []).map((e) => e.toLowerCase()));
  return recipients.filter((r) => !exclude.has(r.email.toLowerCase()) && r.managerId !== actorId);
}

type EnrollmentNotifyInput = {
  event: CenterEnrollmentEvent;
  teacherId: string;
  teacherName: string;
  studentName: string;
  studentEnglishName?: string;
  courseTitle: string;
  courseEnglishTitle?: string;
  schedule?: string;
  startDate?: string;
  endDate?: string;
  totalSessions?: number;
  reason?: string;
  cancelledBy?: "student" | "admin";
  origin: string;
  excludeEmails?: string[]; // 같은 액션에서 이미 관리자 메일을 받은 주소(매니저가 admin 겸직 시 중복 방지)
  delayMs?: number; // 직전에 보낸 메일이 있으면 Resend 초당 2건 제한 회피용 지연(reassign.ts와 동일 방식)
};

/**
 * 담당 센터 매니저에게 수강신청 라이프사이클 알림 발송.
 * `logEnrollmentEvent`와 동일 규약 — **절대 throw하지 않는다**(호출부는 try/catch 없이 한 줄 호출).
 */
export async function notifyCenterManagerOfEnrollment(admin: ReturnType<typeof createAdminClient>, input: EnrollmentNotifyInput): Promise<void> {
  try {
    const recipients = filterRecipients(await loadCenterManagerRecipients(admin, [input.teacherId]), input.excludeEmails);
    if (recipients.length === 0) return;

    if (input.delayMs) await new Promise((resolve) => setTimeout(resolve, input.delayMs));

    for (const r of recipients) {
      await sendEnrollmentEventToCenterManager([r.email], {
        event: input.event,
        centerName: r.centerName,
        teacherName: input.teacherName,
        studentName: input.studentName,
        studentEnglishName: input.studentEnglishName,
        courseTitle: input.courseTitle,
        courseEnglishTitle: input.courseEnglishTitle,
        schedule: input.schedule,
        startDate: input.startDate,
        endDate: input.endDate,
        totalSessions: input.totalSessions,
        reason: input.reason,
        cancelledBy: input.cancelledBy,
        // 매니저는 admin 페이지 접근 불가 — 확정 건은 주간 일정, 그 외는 강사 관리로.
        centerUrl: `${input.origin}/center${input.event === "paid" ? "/schedule" : ""}`,
      });
    }
  } catch (err) {
    console.error("[center-notify] 센터 매니저 알림 발송 실패:", err);
  }
}

type ClassNotifyInput = {
  event: CenterClassEvent;
  teacherIds: string[]; // 관련 강사(대체=기존+새 강사) — 센터가 다르면 매니저 각각에게 발송
  teacherName?: string; // 담당 강사(연기·취소·일정변경)
  oldTeacherName?: string;
  newTeacherName?: string;
  studentName: string;
  studentEnglishName?: string;
  courseTitle: string;
  courseEnglishTitle?: string;
  sessionDate?: string; // 연기·취소·대체 회차
  sessionTime?: string; // "09:00~09:25"
  makeupDate?: string;
  postponeReason?: "student" | "company";
  oldSchedule?: string; // 일괄 변경 전 주간 일정
  newSchedule?: string; // 변경 후(또는 이관 후) 주간 일정
  effectiveDate?: string;
  nextDate?: string;
  affectedCount?: number;
  origin: string;
  actorId?: string; // 실행 주체 — 수신 매니저 본인이면 발송 생략(자기가 한 작업)
  delayMs?: number;
};

/**
 * 담당 센터 매니저에게 수업(클래스) 변경 알림 발송 — admin의 대체·연기·취소·일정 변경.
 * `notifyCenterManagerOfEnrollment`와 동일 규약(자체 try/catch, 절대 throw 안 함).
 */
export async function notifyCenterManagerOfClass(admin: ReturnType<typeof createAdminClient>, input: ClassNotifyInput): Promise<void> {
  try {
    const recipients = filterRecipients(await loadCenterManagerRecipients(admin, input.teacherIds), undefined, input.actorId);
    if (recipients.length === 0) return;

    if (input.delayMs) await new Promise((resolve) => setTimeout(resolve, input.delayMs));

    for (const r of recipients) {
      await sendClassEventToCenterManager([r.email], {
        event: input.event,
        centerName: r.centerName,
        teacherName: input.teacherName,
        oldTeacherName: input.oldTeacherName,
        newTeacherName: input.newTeacherName,
        studentName: input.studentName,
        studentEnglishName: input.studentEnglishName,
        courseTitle: input.courseTitle,
        courseEnglishTitle: input.courseEnglishTitle,
        sessionDate: input.sessionDate,
        sessionTime: input.sessionTime,
        makeupDate: input.makeupDate,
        postponeReason: input.postponeReason,
        oldSchedule: input.oldSchedule,
        newSchedule: input.newSchedule,
        effectiveDate: input.effectiveDate,
        nextDate: input.nextDate,
        affectedCount: input.affectedCount,
        centerUrl: `${input.origin}/center/schedule`, // 수업 변경은 주간 일정에서 확인
      });
    }
  } catch (err) {
    console.error("[center-notify] 센터 매니저 수업 알림 발송 실패:", err);
  }
}
