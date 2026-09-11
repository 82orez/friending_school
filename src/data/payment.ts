// 결제(무통장 입금 1단계) 단일 소스. 회사 입금 계좌 — 학생 마이페이지 입금 안내에 사용.
// 2단계(PortOne PG) 도입 시에도 무통장 옵션 병행을 위해 보존.
export const PAYMENT_BANK = {
  bank: "국민은행",
  account: "680401-00-111464",
  holder: "(주)프렌딩",
} as const;

// 카드 결제(PortOne V2) 노출 스위치. PG사 심사 중이라 비활성 — 심사 완료 시 이 값만 true로 되돌리면 복구된다.
export const CARD_PAYMENT_ENABLED = false;
