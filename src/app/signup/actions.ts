"use server";

import { cookies, headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export type SignupState = { error?: string; success?: string } | null;

export async function signup(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");

  if (!email || !password) {
    return { error: "이메일과 비밀번호를 입력해 주세요." };
  }
  if (password.length < 6) {
    return { error: "비밀번호는 6자 이상이어야 합니다." };
  }
  if (password !== passwordConfirm) {
    return { error: "비밀번호 확인이 일치하지 않습니다." };
  }

  const headerList = await headers();
  const origin = headerList.get("origin") ?? headerList.get("x-forwarded-host") ?? "";

  const supabase = createClient(await cookies());
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: origin ? `${origin}/auth/confirm` : undefined,
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
