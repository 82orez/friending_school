"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getOrigin } from "@/lib/origin";
import { safeNextPath } from "@/lib/url";

// next: 로그인 후 돌아갈 내부 경로. 클라에서 오므로 여기서 검증한 뒤 콜백 URL에 실어 보낸다
// (/auth/confirm이 한 번 더 검증한다 — 이중 방어).
export async function signInWithKakao(next?: string) {
  const headerList = await headers();
  const origin = getOrigin(headerList);
  const supabase = createClient(await cookies());
  const safeNext = safeNextPath(next);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "kakao",
    options: {
      redirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(safeNext)}&flow=oauth`,
    },
  });

  if (error || !data?.url) {
    redirect("/login?error=auth-code-error");
  }

  redirect(data.url);
}
