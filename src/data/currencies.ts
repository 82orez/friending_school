// 센터 단가 통화 단일 소스 — 센터 추가/상세 폼·서버 검증·admin 표시가 모두 참조.
// 저장 값은 코드(code: KRW/PHP), 기호(symbol)는 표시에 사용.
export const CURRENCIES = [
  { code: "KRW", label: "대한민국 원화 (₩)", symbol: "₩" },
  { code: "PHP", label: "필리핀 페소 (₱)", symbol: "₱" },
] as const;

// 서버 검증용 — literal union 회피 위해 string[] 명시.
export const CURRENCY_VALUES: string[] = CURRENCIES.map((c) => c.code);

export const DEFAULT_CURRENCY = "KRW";

// 코드 → 검증된 통화 코드(미일치 시 기본 KRW).
export function normalizeCurrency(code?: string | null): string {
  return code && CURRENCY_VALUES.includes(code) ? code : DEFAULT_CURRENCY;
}

// 금액 + 통화 코드 → 표시 문자열(예: ₩30,000 / ₱1,500).
export function formatPrice(amount: number, code?: string | null): string {
  const c = CURRENCIES.find((x) => x.code === code) ?? CURRENCIES[0];
  return `${c.symbol}${amount.toLocaleString()}`;
}

// 페소 단가를 환율(1 페소당 원)로 원화 환산 → 정수 원. KRW 통화이거나 환율 미설정(≤0)이면 null.
export function krwEquivalent(amount: number, code: string | null | undefined, phpToKrw: number): number | null {
  if (code !== "PHP" || !(phpToKrw > 0)) return null;
  return Math.round(amount * phpToKrw);
}
