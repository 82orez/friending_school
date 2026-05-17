"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";

export type ResetPasswordState = { error?: string } | null;

export async function resetPassword(_prev: ResetPasswordState, formData: FormData): Promise<ResetPasswordState> {
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");

  if (!password) {
    return { error: "비밀번호를 입력해 주세요." };
  }
  if (password.length < 8) {
    return { error: "비밀번호는 8자 이상이어야 합니다." };
  }
  if (password !== passwordConfirm) {
    return { error: "비밀번호 확인이 일치하지 않습니다." };
  }

  const supabase = createClient(await cookies());

  // 새 비밀번호가 기존 비밀번호와 동일한지 확인.
  // Supabase는 비밀번호 비교 API가 없으므로 persistSession: false인 임시 client로
  // signInWithPassword를 시도 → 성공하면 동일. 메인 recovery 세션은 영향받지 않음.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return { error: "세션이 만료되었습니다. 비밀번호 재설정 링크를 다시 요청해 주세요." };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (supabaseUrl && supabaseAnonKey) {
    const verifyClient = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: sameError } = await verifyClient.auth.signInWithPassword({
      email: user.email,
      password,
    });
    if (!sameError) {
      return { error: "새 비밀번호는 기존 비밀번호와 달라야 합니다." };
    }
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: "비밀번호 변경에 실패했습니다. 재설정 링크를 다시 요청해 주세요." };
  }

  // 비밀번호 변경 후 다른 기기/세션 강제 로그아웃(현재 세션은 유지).
  // 비밀번호 유출/탈취 시나리오에서 공격자 세션을 즉시 무효화하기 위함.
  // 실패해도 비밀번호 변경 자체는 성공했으므로 user-facing 에러로 만들지 않고 로그만 남김.
  const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
  if (signOutError) {
    console.error("[resetPassword] 다른 세션 로그아웃 실패:", signOutError);
  }

  revalidatePath("/", "layout");
  redirect("/?reset=success");
}
