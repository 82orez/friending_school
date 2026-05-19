"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getOrigin } from "@/lib/origin";

export async function signInWithKakao() {
  const headerList = await headers();
  const origin = getOrigin(headerList);
  const supabase = createClient(await cookies());

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "kakao",
    options: {
      redirectTo: `${origin}/auth/confirm?next=/&flow=oauth`,
    },
  });

  if (error || !data?.url) {
    redirect("/login?error=auth-code-error");
  }

  redirect(data.url);
}
