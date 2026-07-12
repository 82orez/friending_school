"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createHash, randomInt } from "crypto";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { rateLimit, getClientIp, formatRetryAfter } from "@/lib/rate-limit";
import { normalizePhone, isValidKoreanMobile } from "@/lib/phone";
import { sendSms } from "@/lib/sms";
import { summarizeSlots, type Slot } from "@/lib/availability";
import { getOrigin } from "@/lib/origin";
import { sendEnrollmentCancellationToTeacher } from "@/lib/mailer";
import { logEnrollmentEvent } from "@/lib/events";
import { settlePortonePayment } from "@/lib/payment";

export type StudentActionState = { ok?: boolean; error?: string; transient?: boolean };

// 빈 문자열은 null로 저장, 길이 제한 적용.
function clean(value: FormDataEntryValue | null, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

// 학생 본인 이름 저장. 본인 세션 client로 update —
// RLS(profiles_update_own)가 본인 row만 허용하고 role 트리거가 escalation을 차단하므로 service_role 불필요.
// ⚠️ phone/phone_verified_at은 SMS 인증 플로우에서만 기록(여기선 미포함, DB 트리거가 자가 변경 차단).
export async function updateStudentProfile(_prev: StudentActionState, formData: FormData): Promise<StudentActionState> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const lastName = clean(formData.get("last_name"), 40);
  const firstName = clean(formData.get("first_name"), 40);
  const englishName = clean(formData.get("english_name"), 80);

  // 이름 필수(공백-only는 clean()이 null로 만들어 함께 차단).
  if (!lastName || !firstName) return { error: "성과 이름을 모두 입력해 주세요." };
  // 영문 이름 필수 + 영문자만(클라 sanitize 우회 방어, 서버 authoritative).
  if (!englishName) return { error: "영문 이름을 입력해 주세요." };
  if (!/^[A-Za-z][A-Za-z .'-]*$/.test(englishName)) return { error: "영문 이름은 영문자로만 입력해 주세요." };

  // 전화번호 인증 필수 — 미인증이면 저장 차단(RLS profiles_select_own으로 본인 row 조회).
  const { data: prof } = await supabase.from("profiles").select("phone_verified_at").eq("id", user.id).maybeSingle();
  if (!prof?.phone_verified_at) return { error: "전화번호 인증을 완료해 주세요." };

  // 주소(선택 입력) — 빈값은 clean()이 null로 저장.
  const postcode = clean(formData.get("postcode"), 10);
  const address = clean(formData.get("address"), 200);
  const addressDetail = clean(formData.get("address_detail"), 200);

  // 화이트리스트: first_name·last_name·english_name·주소만 갱신(role·phone 등 미포함).
  const { error } = await supabase
    .from("profiles")
    .update({ first_name: firstName, last_name: lastName, english_name: englishName, postcode, address, address_detail: addressDetail })
    .eq("id", user.id);
  if (error) return { error: "저장 중 문제가 발생했어요." };

  revalidatePath("/mypage", "layout");
  return { ok: true };
}

/* ===== 수강신청 자가 취소 (학생) ===== */

// 학생 본인 수강신청 취소 — 본인 소유 + 상태 '신청'/'승인'/'결제대기'일 때만(거절/취소는 불가).
// 강사 승인/거절과 동일하게 service_role + 소유·상태 가드(RLS에 사용자 UPDATE 정책 없음, 설계상 취소는 service_role 전용).
// 성공 시 강사에게 취소 알림 이메일(best-effort).
export async function cancelEnrollment(enrollmentId: string): Promise<StudentActionState> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const id = String(enrollmentId ?? "").trim();
  if (!id) return { error: "신청을 찾을 수 없어요. 목록을 새로고침해 주세요." };

  const admin = createAdminClient();
  const { data: enr } = await admin
    .from("enrollments")
    .select("id, student_id, teacher_id, status, course, course_title, start_date, slots, student_name, teacher_name")
    .eq("id", id)
    .maybeSingle();
  if (!enr || enr.student_id !== user.id) return { error: "신청을 찾을 수 없어요. 목록을 새로고침해 주세요." };
  if (enr.status !== "신청" && enr.status !== "승인" && enr.status !== "결제대기")
    return { error: "취소할 수 없는 상태입니다. 목록을 새로고침해 주세요." };

  // 상태 가드: '신청'/'승인'/'결제대기'일 때만 갱신(동시 처리 방지).
  const { data, error } = await admin
    .from("enrollments")
    .update({ status: "취소" })
    .eq("id", id)
    .eq("student_id", user.id)
    .in("status", ["신청", "승인", "결제대기"])
    .select("id");
  if (error) return { error: "취소 처리 중 문제가 발생했어요." };
  if (!data || data.length === 0) return { error: "이미 처리된 신청입니다. 목록을 새로고침해 주세요." };

  // 강사 취소 알림 이메일(best-effort) — 실패해도 취소 성공과 분리.
  try {
    const { data: teacherUser } = await admin.auth.admin.getUserById(enr.teacher_id);
    const teacherEmail = teacherUser?.user?.email;
    if (teacherEmail) {
      const origin = getOrigin(await headers());
      const slots = (Array.isArray(enr.slots) ? enr.slots : []) as Slot[];
      await sendEnrollmentCancellationToTeacher([teacherEmail], {
        studentName: enr.student_name ?? "회원",
        courseTitle: enr.course_title,
        schedule: summarizeSlots(slots, false, " / "),
        startDate: enr.start_date,
        teacherUrl: `${origin}/teacher`,
      });
    }
  } catch (err) {
    console.error("[cancelEnrollment] 강사 알림 발송 실패:", err);
  }

  await logEnrollmentEvent(admin, {
    enrollmentId: id,
    eventType: "enrollment_cancelled",
    actorId: user.id,
    actorRole: "student",
    course: enr.course,
    courseTitle: enr.course_title,
    studentName: enr.student_name,
    teacherName: enr.teacher_name,
    detail: { fromStatus: enr.status },
  });

  revalidatePath("/mypage", "layout");
  revalidatePath("/teacher", "layout");
  return { ok: true };
}

// 학생 카드 결제(PortOne V2) 확정 — 클라 결제창 성공 후 호출. 공유 파이프라인 settlePortonePayment가
// 서버 authoritative 검증(status=PAID·금액·통화) → payments 기록 → '결제완료' 확정 → 과오납(중복결제) 자동 환불까지 수행.
// 소유권·상태 재검증은 finalize가 authoritative(중복/재요청 안전). 금액은 절대 클라 신뢰 금지.
export async function confirmPortonePayment(enrollmentId: string, paymentId: string): Promise<StudentActionState> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };
  const id = String(enrollmentId ?? "").trim();
  const pid = String(paymentId ?? "").trim();
  if (!id || !pid) return { error: "결제 정보를 확인할 수 없어요." };

  const res = await settlePortonePayment(pid, { id: user.id, role: "student" });
  if (res.ok) {
    // 결제의 enrollmentId는 customData(서버 검증)가 authoritative — 클릭한 신청과 다르면 로깅만(소유권은 finalize가 보장).
    if (res.enrollmentId && res.enrollmentId !== id) console.warn("[confirmPortonePayment] enrollmentId mismatch", id, res.enrollmentId);
    return { ok: true };
  }
  return { error: res.error, transient: res.transient };
}

/* ===== 전화번호 SMS 인증 (Solapi) ===== */

const OTP_TTL_MS = 3 * 60_000; // 3분 만료
const OTP_RESEND_MS = 60_000; // 재전송 최소 간격 60초
const OTP_MAX_ATTEMPTS = 5; // 검증 시도 cap

function hashCode(code: string, userId: string): string {
  return createHash("sha256").update(`${userId}:${code}`).digest("hex");
}

// 인증번호 발송: 본인 가드 → 번호 검증 → rate limit → 코드 생성·해시 저장 → SMS.
export async function sendPhoneOtp(rawPhone: string): Promise<StudentActionState> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const phone = normalizePhone(rawPhone);
  if (!isValidKoreanMobile(phone)) return { error: "올바른 휴대폰 번호를 입력해 주세요." };

  const ip = getClientIp(await headers());
  const limit = rateLimit(`otp-send:${ip}`, 5, 10 * 60_000);
  if (!limit.allowed) return { error: `요청이 많습니다. ${formatRetryAfter(limit.retryAfterSec)} 다시 시도해 주세요.` };

  const admin = createAdminClient();

  // 재전송 최소 간격 확인(멀티 인스턴스에서도 동작하도록 DB 기준).
  const { data: existing } = await admin.from("phone_verifications").select("last_sent_at").eq("user_id", user.id).maybeSingle();
  if (existing?.last_sent_at) {
    const elapsed = Date.now() - new Date(existing.last_sent_at).getTime();
    if (elapsed < OTP_RESEND_MS) {
      return { error: `잠시 후 다시 시도해 주세요. (${Math.ceil((OTP_RESEND_MS - elapsed) / 1000)}초)` };
    }
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const now = Date.now();
  const { error: upsertErr } = await admin.from("phone_verifications").upsert(
    {
      user_id: user.id,
      phone,
      code_hash: hashCode(code, user.id),
      expires_at: new Date(now + OTP_TTL_MS).toISOString(),
      attempts: 0,
      last_sent_at: new Date(now).toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (upsertErr) return { error: "인증번호 생성 중 문제가 발생했어요." };

  const sent = await sendSms(phone, `[프렌딩 스쿨] 인증번호 ${code} (3분 내 입력)`);
  if (!sent) return { error: "인증번호 발송에 실패했어요. 잠시 후 다시 시도해 주세요." };

  return { ok: true };
}

// 인증번호 확인: 만료·시도횟수·번호·해시 검증 → 성공 시 service_role로 phone + phone_verified_at 기록.
export async function verifyPhoneOtp(rawPhone: string, rawCode: string): Promise<StudentActionState> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const phone = normalizePhone(rawPhone);
  const code = String(rawCode ?? "").trim();
  if (!/^\d{6}$/.test(code)) return { error: "인증번호 6자리를 입력해 주세요." };

  const admin = createAdminClient();
  const { data: row } = await admin.from("phone_verifications").select("phone, code_hash, expires_at, attempts").eq("user_id", user.id).maybeSingle();

  if (!row) return { error: "인증번호를 먼저 요청해 주세요." };
  if (new Date(row.expires_at).getTime() < Date.now()) return { error: "인증번호가 만료되었어요. 다시 요청해 주세요." };
  if (row.attempts >= OTP_MAX_ATTEMPTS) return { error: "시도 횟수를 초과했어요. 인증번호를 다시 요청해 주세요." };

  const ok = row.phone === phone && row.code_hash === hashCode(code, user.id);
  if (!ok) {
    await admin
      .from("phone_verifications")
      .update({ attempts: row.attempts + 1 })
      .eq("user_id", user.id);
    return { error: "인증번호가 일치하지 않아요." };
  }

  // 검증 통과 → service_role로 phone + phone_verified_at 기록(트리거 통과는 service_role만).
  const { error: updErr } = await admin.from("profiles").update({ phone, phone_verified_at: new Date().toISOString() }).eq("id", user.id);
  if (updErr) return { error: "저장 중 문제가 발생했어요." };

  await admin.from("phone_verifications").delete().eq("user_id", user.id);

  revalidatePath("/mypage", "layout");
  return { ok: true };
}
