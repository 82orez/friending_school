"use server";

import { cookies, headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { emailExists } from "@/utils/supabase/admin";
import { getOrigin } from "@/lib/origin";
import { rateLimit, formatRetryAfter } from "@/lib/rate-limit";
import { isValidEmail } from "@/lib/email";

export type ForgotPasswordState = { error?: string; success?: string } | null;

export async function forgotPassword(_prev: ForgotPasswordState, formData: FormData): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    return { error: "이메일을 입력해 주세요." };
  }

  const limit = rateLimit(`forgot-password:${email.toLowerCase()}`, 1, 60_000);
  if (!limit.allowed) {
    return { error: `재설정 메일 요청이 너무 잦습니다. ${formatRetryAfter(limit.retryAfterSec)} 다시 시도해 주세요.` };
  }

  if (!isValidEmail(email)) {
    return { error: "올바른 이메일 형식이 아닙니다." };
  }

  const exists = await emailExists(email);
  if (exists === null) {
    return { error: "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." };
  }
  if (!exists) {
    return { error: "가입되지 않은 이메일입니다. 회원가입 후 이용해 주세요." };
  }

  const headerList = await headers();
  const origin = getOrigin(headerList);
  const redirectTo = `${origin}/auth/confirm?next=/reset-password`;

  const supabase = createClient(await cookies());
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

  if (error) {
    return { error: "재설정 메일 발송 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." };
  }

  return { success: "입력하신 이메일로 비밀번호 재설정 링크를 보냈습니다. 메일함을 확인해 주세요." };
}
