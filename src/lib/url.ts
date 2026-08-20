// 로그인 후 돌아갈 경로(`?next=`) 검증 — open redirect 방지.
// 내부 절대경로(`/...`)만 허용하고 `//host`(프로토콜 상대 URL) 형태는 차단한다.
// 로그인 액션·로그인 페이지·카카오 OAuth·이메일 확인 라우트가 공유하는 단일 소스.
export const DEFAULT_NEXT = "/";

export function safeNextPath(raw: string | null | undefined): string {
  if (typeof raw !== "string") return DEFAULT_NEXT;
  const value = raw.trim();
  if (!value.startsWith("/") || value.startsWith("//")) return DEFAULT_NEXT;
  // `/\`evil.com` 등 백슬래시로 시작하는 변형도 브라우저가 `//`로 해석할 수 있어 함께 차단.
  if (value.startsWith("/\\")) return DEFAULT_NEXT;
  return value;
}

// http/https URL 검증 (Zoom URL 등). 강사 프로필·강사 지원 폼에서 공유.
export function isValidZoomUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
