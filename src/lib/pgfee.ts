// PG(결제대행) 수수료 적용일 이력(pg_fee_schedules) 역산 — 순수 로직(서버·클라 공용, TZ 비종속 문자열 날짜 비교).
// fx.ts(환율 이력)의 수수료율 버전. 각 결제를 그 결제일 기준 유효 율로 계산 → 율 변경이 과거 집계에 소급 안 됨.
// 율은 부가세 포함 총 청구율(예: 3.3), 기준 금액은 순결제액(결제액 − 환불액).

export type PgFeeRow = {
  id: string;
  ratePercent: number; // % (예: 3.3)
  effectiveFrom: string; // 'YYYY-MM-DD'
  note: string | null;
};

// effective_from ≤ date 중 최신 율(없으면 0 = 미설정).
export function pgFeeRateAt(rows: PgFeeRow[], dateStr: string): number {
  let best: PgFeeRow | null = null;
  for (const r of rows) {
    if (r.effectiveFrom > dateStr) continue; // 아직 적용 전
    if (!best || r.effectiveFrom > best.effectiveFrom) best = r;
  }
  return best?.ratePercent ?? 0;
}

// 금액 × 율(%) — 행별 반올림(부가세 역산과 동일 감사 원칙: 행별 반올림 후 합산).
export function pgFeeOf(amount: number, ratePercent: number): number {
  if (!(ratePercent > 0) || !amount) return 0;
  return Math.round((amount * ratePercent) / 100);
}

// PG 경유 결제인가 — 무통장 입금(회사 계좌 직입금)만 수수료 미적용.
export const isPgPayment = (method: string | null | undefined): boolean => method !== "bank_transfer";
