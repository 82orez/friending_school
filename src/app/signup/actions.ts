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
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: origin ? `${origin}/auth/confirm` : undefined,
    },
  });

  if (error) {
    return { error: error.message };
  }

  return { success: "입력하신 이메일로 인증 링크를 보냈습니다. 메일함을 확인해 주세요." };
}
