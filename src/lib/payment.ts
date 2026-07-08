import "server-only";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";
import { getOrigin } from "@/lib/origin";
import { sendSms } from "@/lib/sms";
import { sendEnrollmentPaymentConfirmedToTeacher } from "@/lib/mailer";
import { getCourse } from "@/data/courses";
import { logEnrollmentEvent } from "@/lib/events";
import { TOTAL_SESSIONS, enumerateLessonSessions, isValidSlot, summarizeSlots, lessonEndDate, type Slot } from "@/lib/availability";

export type PaymentResult = { ok: boolean; error?: string };

// 날짜(로컬 Date) → 'YYYY-MM-DD'. enroll-actions의 종료일 포맷과 동일.
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// enrollment에서 날짜별 클래스를 생성(멱등). 결제 확정 시 호출. best-effort — 실패해도 결제 확정은 유지.
export type EnrollmentForClasses = {
  id: string;
  student_id: string;
  teacher_id: string;
  course: string;
  course_title: string;
  teacher_name: string | null;
  student_name: string | null;
  student_english_name: string | null;
  slots: unknown;
  start_date: string;
  total_sessions?: number | null;
};

export async function generateClassesForEnrollment(admin: ReturnType<typeof createAdminClient>, enr: EnrollmentForClasses): Promise<void> {
  const slots: Slot[] = (Array.isArray(enr.slots) ? enr.slots : []).filter(isValidSlot).map((s) => ({ day: Number(s.day), min: Number(s.min) }));
  if (slots.length === 0) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(enr.start_date)) return;
  const [y, m, d] = enr.start_date.split("-").map(Number);
  const total = enr.total_sessions ?? TOTAL_SESSIONS; // 테스트 enrollment는 자유 횟수, 실 신청은 기본 24.
  const sessions = enumerateLessonSessions(new Date(y, m - 1, d), slots, total);
  if (sessions.length === 0) return;

  const rows = sessions.map((s) => ({
    enrollment_id: enr.id,
    student_id: enr.student_id,
    teacher_id: enr.teacher_id,
    course: enr.course,
    course_title: enr.course_title,
    teacher_name: enr.teacher_name,
    student_name: enr.student_name,
    student_english_name: enr.student_english_name,
    session_no: s.sessionNo,
    session_date: toDateStr(s.date),
    start_min: s.startMin,
    end_min: s.endMin,
  }));
  // 멱등 — 같은 (enrollment_id, session_no)는 중복 생성하지 않음.
  const { error } = await admin.from("classes").upsert(rows, { onConflict: "enrollment_id,session_no", ignoreDuplicates: true });
  if (error) console.error("[generateClassesForEnrollment] 클래스 생성 실패:", error);
}

// 결제 확정 코어 — '결제대기' → '결제완료' 전환 + 클래스 생성 + 알림 + 감사 로그 + revalidate.
// admin 입금 확인(confirmPayment)과 학생 테스트 카드 결제(testCardPay)가 공유. 호출부는 각자 권한 가드를 통과한 뒤 호출하고,
// student는 소유권까지 이 헬퍼가 authoritative하게 재검증한다. ⚠️ "use server" 아닌 server-only 모듈이라 클라가 직접 호출 불가.
export async function finalizeEnrollmentPayment(enrollmentId: string, actor: { id: string; role: "admin" | "student" }): Promise<PaymentResult> {
  const admin = createAdminClient();
  const { data: enr } = await admin
    .from("enrollments")
    .select("status, student_phone, course_title, start_date, id, student_id, teacher_id, course, teacher_name, student_name, student_english_name, slots, total_sessions")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (!enr) return { ok: false, error: "신청을 찾을 수 없습니다." };
  // 학생은 본인 신청만 결제 가능(서버 authoritative — 클라 우회 방어).
  if (actor.role === "student" && enr.student_id !== actor.id) return { ok: false, error: "본인 신청만 결제할 수 있습니다." };
  if (enr.status !== "결제대기") return { ok: false, error: "결제 대기 상태에서만 결제할 수 있습니다." };

  const { data, error } = await admin
    .from("enrollments")
    .update({ status: "결제완료" })
    .eq("id", enrollmentId)
    .eq("status", "결제대기")
    .select("id");
  if (error) return { ok: false, error: "결제 처리 중 오류가 발생했습니다." };
  if (!data || data.length === 0) return { ok: false, error: "이미 처리된 신청입니다." };

  // 날짜별 클래스 생성 (best-effort, 멱등) — 실패해도 결제 확정은 유지.
  try {
    await generateClassesForEnrollment(admin, enr as EnrollmentForClasses);
  } catch (err) {
    console.error("[finalizeEnrollmentPayment] 클래스 생성 실패:", err);
  }

  // 학생 결과 SMS (best-effort).
  if (enr.student_phone) {
    try {
      await sendSms(
        enr.student_phone,
        `[프렌딩 스쿨] 결제가 확인되어 수업이 확정되었습니다. ${enr.course_title} · 시작 ${enr.start_date}. 자세한 내용은 마이페이지(내 강의실)에서 확인하세요.`,
      );
    } catch (err) {
      console.error("[finalizeEnrollmentPayment] SMS 발송 실패:", err);
    }
  }

  // 강사 결제 확정 알림 메일(best-effort) — 수업이 생성되어 My Classroom에 잡히므로 강사에게 통보.
  try {
    const origin = getOrigin(await headers());
    const sessions = enr.total_sessions ?? TOTAL_SESSIONS;
    const endDate = (() => {
      const [sy, sm, sd] = String(enr.start_date ?? "").split("-").map(Number);
      if (!sy || !sm || !sd) return "";
      const endObj = lessonEndDate(new Date(sy, sm - 1, sd), (enr.slots as Slot[]) ?? [], sessions);
      return endObj
        ? `${endObj.getFullYear()}-${String(endObj.getMonth() + 1).padStart(2, "0")}-${String(endObj.getDate()).padStart(2, "0")}`
        : "";
    })();
    const { data: teacherUser } = await admin.auth.admin.getUserById(enr.teacher_id);
    const teacherEmail = teacherUser?.user?.email;
    if (teacherEmail) {
      await sendEnrollmentPaymentConfirmedToTeacher([teacherEmail], {
        studentName: enr.student_name,
        courseTitle: enr.course_title,
        schedule: summarizeSlots((enr.slots as Slot[]) ?? [], false),
        startDate: enr.start_date,
        teacherUrl: `${origin}/teacher`,
        studentEnglishName: enr.student_english_name ?? "",
        courseEnglishTitle: getCourse(enr.course)?.englishTitle,
        endDate,
        totalSessions: sessions,
      });
    }
  } catch (err) {
    console.error("[finalizeEnrollmentPayment] 강사 알림 발송 실패:", err);
  }

  await logEnrollmentEvent(admin, {
    enrollmentId,
    eventType: "payment_confirmed",
    actorId: actor.id,
    actorRole: actor.role,
    course: enr.course,
    courseTitle: enr.course_title,
    studentName: enr.student_name,
    teacherName: enr.teacher_name,
    detail: {
      sessionsGenerated: enr.total_sessions ?? TOTAL_SESSIONS,
      startDate: enr.start_date,
      ...(actor.role === "student" ? { via: "test_card" } : {}),
    },
  });

  revalidatePath("/admin/enrollments");
  revalidatePath("/admin/classes");
  revalidatePath("/teacher", "layout");
  revalidatePath("/mypage", "layout");
  return { ok: true };
}
