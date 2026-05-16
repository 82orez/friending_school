"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

/**
 * Supabase가 이메일 인증/재설정 후 implicit (hash) 플로우로 토큰을 보낼 때 처리.
 * 서버는 URL fragment(#...)를 볼 수 없어 /auth/confirm 라우트에서 처리 불가하므로,
 * 클라이언트에서 hash를 읽어 supabase.auth.setSession()으로 세션을 생성 후 적절히 redirect.
 *
 * 처리 중에는 풀스크린 로딩 오버레이를 노출해, 사용자가 빈 화면이나 로그인 폼을 보고
 * 혼란스러워하지 않도록 함.
 *
 * 주의: 이는 fallback이며, Supabase 이메일 템플릿을 token_hash 방식으로 변경하는 것이 더 깔끔.
 */
export default function AuthHashHandler() {
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash.includes("access_token")) return;

    const params = new URLSearchParams(hash.startsWith("#") ? hash.substring(1) : hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const type = params.get("type");

    if (!accessToken || !refreshToken) return;

    setProcessing(true);

    const supabase = createClient();
    supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(({ error }) => {
      if (error) {
        console.error("URL hash로부터 세션 생성 실패:", error);
        setProcessing(false);
        return;
      }
      const next = type === "recovery" ? "/reset-password" : "/?verified=success";
      // 클라이언트 사이드 navigation(router.replace)으로는 hash가 URL에 남거나
      // layout이 unmount되지 않아 오버레이가 갇히는 경우가 있어, 하드 네비게이션으로 강제.
      // 새 페이지가 fresh load되어 서버가 즉시 새 쿠키를 읽고, 오버레이는 navigation 동안
      // 자연스럽게 유지되다가 새 페이지 렌더 시 소멸함.
      window.location.replace(next);
    });
  }, []);

  if (!processing) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/90 backdrop-blur-sm" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#ff4757]/20 border-t-[#ff4757]" aria-hidden="true" />
        <p className="text-sm font-medium text-[#333]">인증 정보를 처리하고 있습니다...</p>
      </div>
    </div>
  );
}
