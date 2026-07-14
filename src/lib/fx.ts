// 외화 환율 적용일 이력(exchange_rate_schedules) 역산 — 순수 로직(서버·클라 공용, TZ 비종속 문자열 날짜 비교).
// rates.ts(단가 이력)의 환율 버전. 각 금액을 그 금액의 날짜 기준 유효 환율로 원화 환산 → 시기별 환율이 과거에 소급 안 됨.

import { type Rates, FOREIGN_CURRENCIES } from "@/data/currencies";

export type FxRow = {
  id: string;
  currency: string; // PHP | USD
  rate: number; // 1단위당 원(₩)
  effectiveFrom: string; // 'YYYY-MM-DD'
  note: string | null;
};

// currency에 대해 effective_from ≤ date 중 최신 환율(없으면 0 = 미설정).
export function fxRateAt(rows: FxRow[], currency: string, dateStr: string): number {
  let best: FxRow | null = null;
  for (const r of rows) {
    if (r.currency !== currency) continue;
    if (r.effectiveFrom > dateStr) continue; // 아직 적용 전
    if (!best || r.effectiveFrom > best.effectiveFrom) best = r;
  }
  return best?.rate ?? 0;
}

// 금액을 그 날짜 환율로 원화 환산(집계용). KRW=그대로, 외화=rate>0면 반올림, 미설정이면 0.
export function toKrwAt(amount: number, currency: string | null | undefined, rows: FxRow[], dateStr: string): number {
  if (!currency || currency === "KRW") return amount;
  const rate = fxRateAt(rows, currency, dateStr);
  return rate > 0 ? Math.round(amount * rate) : 0;
}

// 금액을 그 날짜 환율로 원화 환산(표시용). KRW=그대로, 외화=rate>0면 반올림, 미설정이면 null(환산 불가 구분).
export function krwAtOrNull(amount: number, currency: string | null | undefined, rows: FxRow[], dateStr: string): number | null {
  if (!currency || currency === "KRW") return amount;
  const rate = fxRateAt(rows, currency, dateStr);
  return rate > 0 ? Math.round(amount * rate) : null;
}

// 특정 날짜 기준 통화별 환율 스칼라 맵(Rates) — 필요 시 date-specific 스냅샷.
export function fxRatesAt(rows: FxRow[], dateStr: string): Rates {
  const rates: Rates = {};
  for (const f of FOREIGN_CURRENCIES) rates[f.code] = fxRateAt(rows, f.code, dateStr);
  return rates;
}
