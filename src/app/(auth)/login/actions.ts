"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getUserIdentitySummary } from "@/utils/supabase/admin";
import { getOrigin } from "@/lib/origin";
import { rateLimit, formatRetryAfter } from "@/lib/rate-limit";
import { isValidEmail } from "@/lib/email";

export type LoginState = { error?: string; canResend?: boolean } | null;
export type ResendConfirmationResult = { error?: string; success?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "이메일과 비밀번호를 입력해 주세요." };
  }

  const limit = rateLimit(`login:${email.toLowerCase()}`, 10, 60_000);
  if (!limit.allowed) {
    return { error: `로그인 시도가 너무 잦습니다. ${formatRetryAfter(limit.retryAfterSec)} 다시 시도해 주세요.` };
  }

  if (!isValidEmail(email)) {
    return { error: "올바른 이메일 형식이 아닙니다." };
  }

  const supabase = createClient(await cookies());
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "이메일 인증이 완료되지 않았습니다. 인증 메일을 확인해 주세요.", canResend: true };
    }
    if (error.code === "invalid_credentials") {
      const summary = await getUserIdentitySummary(email);
      if (summary === null) {
        return { error: "로그인 중 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." };
      }
      if (!summary.found) {
        return { error: "가입되지 않은 이메일입니다. 회원가입 후 이용해 주세요." };
      }
      if (summary.hasPassword) {
        return { error: "비밀번호가 일치하지 않습니다." };
      }
      // hasPassword=false면 OAuth 가입자. 현재 지원 provider는 카카오뿐이라
      // oauthProviders가 비어 있더라도 카카오 안내로 통일.
      return { error: "이 이메일은 카카오로 가입된 계정입니다. 아래 '카카오로 시작하기'를 이용해 주세요." };
    }
    return { error: "로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function resendConfirmation(email: string): Promise<ResendConfirmationResult> {
  const trimmed = email.trim();
  if (!trimmed) {
    return { error: "이메일을 입력해 주세요." };
  }

  const limit = rateLimit(`resend:${trimmed.toLowerCase()}`, 1, 60_000);
  if (!limit.allowed) {
    return { error: `재발송 요청이 너무 잦습니다. ${formatRetryAfter(limit.retryAfterSec)} 다시 시도해 주세요.` };
  }

  if (!isValidEmail(trimmed)) {
    return { error: "올바른 이메일 형식이 아닙니다." };
  }

  const headerList = await headers();
  const origin = getOrigin(headerList);

  const supabase = createClient(await cookies());
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: trimmed,
    options: { emailRedirectTo: `${origin}/auth/confirm` },
  });

  if (error) {
    return { error: "인증 메일 재발송에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }

  return { success: "인증 메일을 다시 보냈습니다. 메일함을 확인해 주세요." };
}
