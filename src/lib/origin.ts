/**
 * 서버 액션/라우트에서 이메일 redirectTo 등에 사용할 절대 origin을 반환.
 *
 * 우선순위:
 * 1. `NEXT_PUBLIC_SITE_URL` 환경변수 (운영 환경에서 권장 — 결정론적)
 * 2. `origin` 헤더 (브라우저가 보낸 요청 origin, 프로토콜 포함)
 * 3. `x-forwarded-host` + `x-forwarded-proto` (프록시 뒤)
 * 4. `host` 헤더 + 로컬/원격 추정 프로토콜 (최후 수단)
 */
export function getOrigin(headerList: Headers): string {
  const envOrigin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (envOrigin) return envOrigin;

  const origin = headerList.get("origin");
  if (origin) return origin;

  const forwardedHost = headerList.get("x-forwarded-host");
  if (forwardedHost) {
    const proto = headerList.get("x-forwarded-proto") ?? "https";
    return `${proto}://${forwardedHost}`;
  }

  const host = headerList.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}
