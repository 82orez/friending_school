// 센터 단가 통화 단일 소스 — 센터 추가/상세 폼·서버 검증·admin 표시가 모두 참조.
// 저장 값은 코드(code: KRW/PHP/USD), 기호(symbol)는 표시에 사용.
export const CURRENCIES = [
  { code: "KRW", label: "대한민국 원화 (₩)", symbol: "₩" },
  { code: "PHP", label: "필리핀 페소 (₱)", symbol: "₱" },
  { code: "USD", label: "미국 달러 ($)", symbol: "$" },
] as const;

// 서버 검증용 — literal union 회피 위해 string[] 명시.
export const CURRENCY_VALUES: string[] = CURRENCIES.map((c) => c.code);

export const DEFAULT_CURRENCY = "KRW";

// 원화(KRW)로 환산 가능한 외화 — 각각 settings 환율 키를 가짐(1단위당 원). KRW는 환산 불필요.
export const FOREIGN_CURRENCIES = [
  { code: "PHP", settingKey: "php_to_krw", symbol: "₱", rateLabel: "페소" },
  { code: "USD", settingKey: "usd_to_krw", symbol: "$", rateLabel: "달러" },
] as const;

// 통화코드 → 1단위당 원(₩) 환율. 미설정/미지원 통화는 0.
export type Rates = Record<string, number>;

// 코드 → 검증된 통화 코드(미일치 시 기본 KRW).
export function normalizeCurrency(code?: string | null): string {
  return code && CURRENCY_VALUES.includes(code) ? code : DEFAULT_CURRENCY;
}

// 금액 + 통화 코드 → 표시 문자열(예: ₩30,000 / ₱1,500 / $100).
export function formatPrice(amount: number, code?: string | null): string {
  const c = CURRENCIES.find((x) => x.code === code) ?? CURRENCIES[0];
  return `${c.symbol}${amount.toLocaleString()}`;
}

// 외화 단가를 환율 맵으로 원화 환산 → 정수 원. KRW이거나 환율 미설정(≤0)이면 null.
export function krwEquivalent(amount: number, code: string | null | undefined, rates: Rates): number | null {
  if (!code || code === "KRW") return null;
  const rate = rates[code];
  if (!(rate > 0)) return null;
  return Math.round(amount * rate);
}

// settings 조회 결과(key/value 행) → 통화코드별 환율 맵. 각 FOREIGN_CURRENCIES.settingKey 값을 매핑(없으면 0).
export function ratesFromSettings(rows: { key: string; value: string | null }[] | null): Rates {
  const byKey = new Map((rows ?? []).map((r) => [r.key, Number(r.value) || 0]));
  const rates: Rates = {};
  for (const f of FOREIGN_CURRENCIES) rates[f.code] = byKey.get(f.settingKey) ?? 0;
  return rates;
}
