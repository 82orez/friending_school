// 부가세(VAT) 분해 헬퍼 — 저장된 결제금액은 부가세 포함 합계(총액표시)이므로 역산해 공급가액/부가세로 분리.
// 통화 무관(÷1.1)이라 KRW 집계·원통화 거래목록 양쪽에서 공용. server-only 아님(로더/클라 공유).
export const VAT_RATE = 0.1;

// 공급가액 = 합계 ÷ 1.1 (원 단위 반올림). 행별로 반올림 후 합산해 감사 정합성 확보.
export const vatSupply = (total: number): number => Math.round(total / (1 + VAT_RATE));
// 부가세 = 합계 − 공급가액 (반올림 잔차를 부가세에 귀속).
export const vatAmount = (total: number): number => total - vatSupply(total);
export const vatBreakdown = (total: number): { supply: number; vat: number } => {
  const supply = vatSupply(total);
  return { supply, vat: total - supply };
};
