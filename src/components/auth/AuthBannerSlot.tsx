"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Auth 페이지의 query string 기반 안내 배너 영역.
 * URL hash에 access_token이 있는 경우(implicit 플로우로 도착) AuthHashHandler가 곧 세션 생성 후
 * redirect하므로, 그 사이 잠깐이라도 에러 배너가 깜빡이지 않도록 노출 자체를 차단.
 *
 * SSR 시점에는 hash를 알 수 없으므로 일단 null을 렌더하고, hydrate 후 useEffect에서 판정.
 * → 정상 케이스(에러 query만 있고 hash 없음)는 hydrate 직후 표시되며 깜빡임 없음.
 */
export default function AuthBannerSlot({ children }: { children: ReactNode }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash.includes("access_token")) return;
    setShow(true);
  }, []);

  if (!show) return null;
  return <>{children}</>;
}
