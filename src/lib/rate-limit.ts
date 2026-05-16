/**
 * 단순 in-memory 토큰 버킷 기반 rate limiter.
 *
 * 한계:
 * - 프로세스 메모리에 저장되므로 재시작 시 초기화됨.
 * - 서버리스/멀티 인스턴스 환경에서는 인스턴스별로 카운트가 분리되어 효과 감소.
 *   → 운영 트래픽이 늘면 Upstash Redis 등 외부 스토어로 교체 권장
 *     (`rateLimit` 함수 시그니처만 유지하면 호출부 수정 불필요).
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let lastCleanup = Date.now();
const CLEANUP_INTERVAL_MS = 60_000;

function cleanupStale(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  buckets.forEach((bucket, key) => {
    if (bucket.resetAt < now) buckets.delete(key);
  });
}

export type RateLimitResult = { allowed: boolean; retryAfterSec: number };

export function rateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  cleanupStale(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }
  if (bucket.count >= max) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  bucket.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}

export function getClientIp(headerList: Headers): string {
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = headerList.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

export function formatRetryAfter(retryAfterSec: number): string {
  if (retryAfterSec < 60) return `${retryAfterSec}초 후`;
  return `${Math.ceil(retryAfterSec / 60)}분 후`;
}
