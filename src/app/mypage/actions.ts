"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createHash, randomInt } from "crypto";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { rateLimit, getClientIp, formatRetryAfter } from "@/lib/rate-limit";
import { normalizePhone, isValidKoreanMobile } from "@/lib/phone";
import { sendSms } from "@/lib/sms";

export type StudentActionState = { ok?: boolean; error?: string };

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

  // 화이트리스트: first_name·last_name만 갱신(role·phone 등 미포함).
  const { error } = await supabase.from("profiles").update({ first_name: firstName, last_name: lastName }).eq("id", user.id);
  if (error) return { error: "저장 중 문제가 발생했어요." };

  revalidatePath("/mypage");
  return { ok: true };
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
  const { data: row } = await admin
    .from("phone_verifications")
    .select("phone, code_hash, expires_at, attempts")
    .eq("user_id", user.id)
    .maybeSingle();

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

  revalidatePath("/mypage");
  return { ok: true };
}
