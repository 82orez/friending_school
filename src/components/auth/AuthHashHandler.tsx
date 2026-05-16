"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

/**
 * Supabase가 이메일 인증/재설정 후 implicit (hash) 플로우로 토큰을 보낼 때 처리.
 * 서버는 URL fragment(#...)를 볼 수 없어 /auth/confirm 라우트에서 처리 불가하므로,
 * 클라이언트에서 hash를 읽어 supabase.auth.setSession()으로 세션을 생성 후 적절히 redirect.
 *
 * 주의: 이는 fallback이며, Supabase 이메일 템플릿을 token_hash 방식으로 변경하는 것이 더 깔끔.
 */
export default function AuthHashHandler() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash.includes("access_token")) return;

    const params = new URLSearchParams(hash.startsWith("#") ? hash.substring(1) : hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const type = params.get("type");

    if (!accessToken || !refreshToken) return;

    const supabase = createClient();
    supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(({ error }) => {
      if (error) {
        console.error("URL hash로부터 세션 생성 실패:", error);
        return;
      }
      const next = type === "recovery" ? "/reset-password" : "/?verified=success";
      router.replace(next);
      router.refresh();
    });
  }, [router]);

  return null;
}
