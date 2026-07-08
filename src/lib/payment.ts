import "server-only";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";
import { getOrigin } from "@/lib/origin";
import { sendSms } from "@/lib/sms";
import { sendEnrollmentPaymentConfirmedToTeacher, sendEnrollmentRefundToTeacher } from "@/lib/mailer";
import { getCourse } from "@/data/courses";
import { logEnrollmentEvent } from "@/lib/events";
import { TOTAL_SESSIONS, enumerateLessonSessions, isValidSlot, summarizeSlots, lessonEndDate, lessonEndMin, type Slot } from "@/lib/availability";
import { kstDateMinToMs } from "@/lib/classtime";
import { getVerifiedPortonePayment, cancelPortonePayment } from "@/lib/portone";

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
// admin 입금 확인(confirmPayment)·학생 PortOne 카드 결제(confirmPortonePayment)·PortOne 웹훅(role:"system")이 공유.
// 호출부는 각자 권한/서명 가드를 통과한 뒤 호출하고, student는 소유권까지 이 헬퍼가 authoritative하게 재검증한다
// (system=웹훅은 서명+결제 재조회로 이미 authoritative라 소유권 skip). ⚠️ "use server" 아닌 server-only 모듈이라 클라가 직접 호출 불가.
export async function finalizeEnrollmentPayment(
  enrollmentId: string,
  actor: { id: string; role: "admin" | "student" | "system" },
): Promise<PaymentResult> {
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
    actorId: actor.role === "system" ? null : actor.id, // system=웹훅은 auth.users FK가 없어 null
    actorRole: actor.role,
    course: enr.course,
    courseTitle: enr.course_title,
    studentName: enr.student_name,
    teacherName: enr.teacher_name,
    detail: {
      sessionsGenerated: enr.total_sessions ?? TOTAL_SESSIONS,
      startDate: enr.start_date,
      ...(actor.role === "student" ? { via: "portone_card" } : actor.role === "system" ? { via: "portone_webhook" } : {}),
    },
  });

  revalidatePath("/admin/enrollments");
  revalidatePath("/admin/classes");
  revalidatePath("/teacher", "layout");
  revalidatePath("/mypage", "layout");
  return { ok: true };
}

/* ===== 결제 기록 · 정산 파이프라인 · 환불(PortOne) ===== */

type RecordPaymentInput = {
  paymentId: string;
  enrollmentId?: string | null;
  studentId?: string | null;
  amount?: number;
  currency?: string;
  pgTxId?: string;
  method?: string;
  receiptUrl?: string;
  raw?: unknown;
};

// payments 기록(멱등 insert-once) — 같은 payment_id 재기록은 no-op(이후 취소 상태를 덮어쓰지 않도록).
export async function recordPayment(admin: ReturnType<typeof createAdminClient>, input: RecordPaymentInput): Promise<void> {
  const { error } = await admin.from("payments").upsert(
    {
      payment_id: input.paymentId,
      enrollment_id: input.enrollmentId ?? null,
      student_id: input.studentId ?? null,
      amount: Number.isFinite(input.amount) ? input.amount : 0,
      currency: input.currency ?? "KRW",
      status: "paid",
      pg_tx_id: input.pgTxId ?? null,
      method: input.method ?? null,
      receipt_url: input.receiptUrl ?? null,
      raw: input.raw ?? null,
    },
    { onConflict: "payment_id", ignoreDuplicates: true },
  );
  if (error) console.error("[recordPayment] 결제 기록 실패:", error);
}

export type SettleResult = { ok: boolean; enrollmentId?: string; error?: string; transient?: boolean; overpaid?: boolean };

// PortOne 결제 정산 파이프라인(학생 confirm·웹훅 Paid 공용): 검증 → 기록 → 확정 → 과오납(중복결제) 자동 환불.
export async function settlePortonePayment(paymentId: string, actor: { id: string; role: "student" | "system" }): Promise<SettleResult> {
  const v = await getVerifiedPortonePayment(paymentId);
  if (!v.ok) return { ok: false, error: v.error, transient: v.transient };

  const admin = createAdminClient();
  const enrollmentId = v.enrollmentId!;
  const { data: enrRow } = await admin.from("enrollments").select("student_id, status").eq("id", enrollmentId).maybeSingle();

  await recordPayment(admin, {
    paymentId,
    enrollmentId,
    studentId: enrRow?.student_id ?? null,
    amount: v.amount,
    currency: v.currency,
    pgTxId: v.pgTxId,
    method: v.method,
    receiptUrl: v.receiptUrl,
    raw: v.raw,
  });

  const fin = await finalizeEnrollmentPayment(enrollmentId, actor);
  if (fin.ok) return { ok: true, enrollmentId };

  // 확정 실패가 "이미 처리"이고 enrollment가 이미 결제완료 + 이 결제와 다른 'paid' 결제가 있으면 = 과오납 → 자동 전액 환불.
  const alreadyPaid = enrRow?.status === "결제완료" || fin.error === "이미 처리된 신청입니다.";
  if (alreadyPaid) {
    const { data: others } = await admin
      .from("payments")
      .select("payment_id")
      .eq("enrollment_id", enrollmentId)
      .eq("status", "paid")
      .neq("payment_id", paymentId);
    if (others && others.length > 0) {
      const cancel = await cancelPortonePayment(paymentId, { reason: "중복 결제 자동 환불" });
      if (cancel.ok) {
        await admin.from("payments").update({ status: "cancelled", cancelled_amount: v.amount ?? 0 }).eq("payment_id", paymentId);
        await logEnrollmentEvent(admin, {
          enrollmentId,
          eventType: "payment_refunded",
          actorId: null,
          actorRole: actor.role,
          detail: { auto: true, reason: "중복 결제", refundAmount: v.amount },
        });
      } else {
        console.error("[settlePortonePayment] 과오납 자동환불 실패:", paymentId, cancel.error);
      }
      return { ok: false, overpaid: true, error: "이미 결제된 신청이라 이번 결제는 자동 환불됩니다." };
    }
  }
  return { ok: false, error: fin.error };
}

type RefundSyncInput = {
  payment: { payment_id: string; enrollment_id?: string | null; amount?: number };
  totalCancelledAmount: number; // PortOne 기준 누적 취소금액(절대값 — 멱등)
  reason: string;
  actor: { id: string; role: "admin" | "system" };
};

// 환불 후 DB 동기화 코어(admin 환불·취소 웹훅 공용) — PortOne 취소는 호출측에서 이미 수행됨.
// 멱등: totalCancelledAmount는 절대값으로 set, enrollment 취소는 CAS(결제완료→취소)라 재호출 시 no-op.
export async function refundEnrollmentPayment(admin: ReturnType<typeof createAdminClient>, input: RefundSyncInput): Promise<PaymentResult> {
  const { payment, totalCancelledAmount, reason, actor } = input;
  const isFull = totalCancelledAmount >= (payment.amount ?? 0);

  await admin
    .from("payments")
    .update({ status: isFull ? "cancelled" : "partial_cancelled", cancelled_amount: totalCancelledAmount })
    .eq("payment_id", payment.payment_id);

  const enrollmentId = payment.enrollment_id;
  if (!enrollmentId) return { ok: true }; // enrollment 없는 결제 — payments만 갱신.

  const { data: enr } = await admin
    .from("enrollments")
    .select("id, status, student_phone, student_name, course, course_title, teacher_id, teacher_name")
    .eq("id", enrollmentId)
    .maybeSingle();

  const { data: updated } = await admin
    .from("enrollments")
    .update({ status: "취소", teacher_note: `[관리자] 환불: ${reason}`.slice(0, 1000) })
    .eq("id", enrollmentId)
    .eq("status", "결제완료")
    .select("id");
  const cancelledNow = updated && updated.length > 0; // 이번 호출에서 실제로 취소 전환됐는지(중복 알림 방지)

  if (cancelledNow) {
    // 미래 예정 수업 일괄 취소(보강 없음). 과거·진행된 수업은 유지.
    const { data: classes } = await admin.from("classes").select("id, session_date, end_min").eq("enrollment_id", enrollmentId).eq("status", "예정");
    const now = Date.now();
    const futureIds = (classes ?? []).filter((c) => now < kstDateMinToMs(c.session_date, lessonEndMin(c.end_min))).map((c) => c.id);
    if (futureIds.length > 0) {
      const { error } = await admin.from("classes").update({ status: "취소", cancel_reason: "cancel" }).in("id", futureIds);
      if (error) console.error("[refundEnrollmentPayment] 미래 수업 취소 실패:", error);
    }

    if (enr?.student_phone) {
      try {
        await sendSms(enr.student_phone, `[프렌딩 스쿨] 환불이 처리되어 수강이 취소되었습니다. ${enr.course_title}. 문의는 고객센터로 연락해 주세요.`);
      } catch (err) {
        console.error("[refundEnrollmentPayment] SMS 실패:", err);
      }
    }
    try {
      const origin = getOrigin(await headers());
      const { data: teacherUser } = await admin.auth.admin.getUserById(enr.teacher_id);
      const teacherEmail = teacherUser?.user?.email;
      if (teacherEmail) {
        await sendEnrollmentRefundToTeacher([teacherEmail], {
          studentName: enr.student_name,
          courseTitle: enr.course_title,
          courseEnglishTitle: getCourse(enr.course)?.englishTitle,
          teacherUrl: `${origin}/teacher`,
        });
      }
    } catch (err) {
      console.error("[refundEnrollmentPayment] 강사 메일 실패:", err);
    }

    await logEnrollmentEvent(admin, {
      enrollmentId,
      eventType: "payment_refunded",
      actorId: actor.role === "system" ? null : actor.id,
      actorRole: actor.role,
      course: enr?.course,
      courseTitle: enr?.course_title,
      studentName: enr?.student_name,
      teacherName: enr?.teacher_name,
      detail: { refundAmount: totalCancelledAmount, reason, full: isFull },
    });
  }

  revalidatePath("/admin/enrollments");
  revalidatePath("/admin/classes");
  revalidatePath("/teacher", "layout");
  revalidatePath("/mypage", "layout");
  return { ok: true };
}
