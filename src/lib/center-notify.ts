import "server-only";

import { createAdminClient } from "@/utils/supabase/admin";
import { sendEnrollmentEventToCenterManager, type CenterEnrollmentEvent } from "@/lib/mailer";

export type { CenterEnrollmentEvent };

// 강사 → 현재 소속 센터 → 매니저 계정 이메일. 센터 미지정·매니저 미지정·이메일 없음이면 빈 배열.
// 정산·매출과 동일하게 '현재 소속 센터' 기준(강사 센터 이동 시 과거 건 소급 없음).
export async function loadCenterManagerContacts(
  admin: ReturnType<typeof createAdminClient>,
  teacherId: string,
): Promise<{ emails: string[]; centerName?: string }> {
  if (!teacherId) return { emails: [] };
  const { data: prof } = await admin.from("profiles").select("center_id").eq("id", teacherId).maybeSingle();
  if (!prof?.center_id) return { emails: [] };

  const { data: center } = await admin.from("centers").select("name, manager_id").eq("id", prof.center_id).maybeSingle();
  if (!center?.manager_id) return { emails: [], centerName: center?.name ?? undefined };

  const { data: mgr } = await admin.auth.admin.getUserById(center.manager_id);
  const email = mgr?.user?.email;
  return { emails: email ? [email] : [], centerName: center.name ?? undefined };
}

type NotifyInput = {
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
export async function notifyCenterManagerOfEnrollment(admin: ReturnType<typeof createAdminClient>, input: NotifyInput): Promise<void> {
  try {
    const { emails, centerName } = await loadCenterManagerContacts(admin, input.teacherId);
    const exclude = new Set((input.excludeEmails ?? []).map((e) => e.toLowerCase()));
    const to = emails.filter((e) => !exclude.has(e.toLowerCase()));
    if (to.length === 0) return;

    if (input.delayMs) await new Promise((resolve) => setTimeout(resolve, input.delayMs));

    await sendEnrollmentEventToCenterManager(to, {
      event: input.event,
      centerName,
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
  } catch (err) {
    console.error("[center-notify] 센터 매니저 알림 발송 실패:", err);
  }
}
