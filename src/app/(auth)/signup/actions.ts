"use server";

import { cookies, headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getUserIdentitySummary } from "@/utils/supabase/admin";
import { getOrigin } from "@/lib/origin";
import { rateLimit, getClientIp, formatRetryAfter } from "@/lib/rate-limit";
import { isValidEmail } from "@/lib/email";

export type SignupState = { error?: string; success?: string; canResend?: boolean } | null;

export async function signup(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");

  if (!email || !password) {
    return { error: "이메일과 비밀번호를 입력해 주세요." };
  }
  if (password.length < 8) {
    return { error: "비밀번호는 8자 이상이어야 합니다." };
  }
  if (password !== passwordConfirm) {
    return { error: "비밀번호 확인이 일치하지 않습니다." };
  }

  const headerList = await headers();
  const ip = getClientIp(headerList);
  const limit = rateLimit(`signup:${ip}`, 5, 5 * 60_000);
  if (!limit.allowed) {
    return { error: `회원가입 시도가 너무 잦습니다. ${formatRetryAfter(limit.retryAfterSec)} 다시 시도해 주세요.` };
  }

  if (!isValidEmail(email)) {
    return { error: "올바른 이메일 형식이 아닙니다." };
  }

  // 미확인 사용자가 재가입을 시도하면 Supabase는 저장된 비밀번호를 새 값으로 덮어쓰므로,
  // signUp() 호출 전에 상태를 확인해 차단한다. admin API 실패 시에는 fail closed.
  // OAuth(카카오)로만 가입된 사용자도 confirmed로 잡히므로 provider 분기로 더 정확한 안내.
  const summary = await getUserIdentitySummary(email);
  if (summary === null) {
    return { error: "회원가입 중 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." };
  }
  if (summary.found && !summary.confirmed) {
    return {
      error: "이미 가입 시도된 이메일입니다. 메일함을 확인하시거나 아래 '다시 보내기'를 이용해 주세요.",
      canResend: true,
    };
  }
  if (summary.found && summary.hasPassword) {
    return { error: "이미 가입된 이메일입니다. 로그인 페이지에서 로그인해 주세요." };
  }
  if (summary.found) {
    // hasPassword=false면 OAuth 가입자. 현재 지원 provider는 카카오뿐이라
    // oauthProviders가 비어 있더라도(=identities 조회 누락 등 비정상) 카카오 안내로 통일.
    return { error: "이 이메일은 카카오로 가입된 계정입니다. 로그인 페이지에서 '카카오로 시작하기'를 이용해 주세요." };
  }

  const origin = getOrigin(headerList);

  const supabase = createClient(await cookies());
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/confirm`,
    },
  });

  if (error) {
    if (error.code === "user_already_exists" || /already\s+registered/i.test(error.message)) {
      return { error: "이미 가입된 이메일입니다. 로그인 페이지에서 로그인해 주세요." };
    }
    return { error: "회원가입 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." };
  }

  // 이메일 확인이 켜진 Supabase 프로젝트에서는 중복 이메일이어도 에러 대신
  // data.user.identities가 빈 배열로 반환됩니다(사용자 열거 방지).
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return { error: "이미 가입된 이메일입니다. 로그인 페이지에서 로그인해 주세요." };
  }

  return { success: "입력하신 이메일로 인증 링크를 보냈습니다. 메일함을 확인해 주세요." };
}
