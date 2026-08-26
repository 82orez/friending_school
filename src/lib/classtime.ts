// 화상수업 클래스 입장 시간창 공유 모델 — 클래스 페이지(표시)·입장 액션(서버 강제) 공용.
// session_date(KST 날짜 YYYY-MM-DD) + 분(자정 기준)을 절대 시각(epoch ms)으로 변환.
// 한국은 DST가 없어 KST=UTC+9 고정 오프셋으로 계산(앱 전반의 KST 문자열 관례와 일관).

// 고정 오프셋(DST 없음). 자정 기준 분 환산이 필요한 곳에서 복제하지 않도록 export한다(prep.ts의 kstMinuteOfDay).
export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 수업 시작 가능 시점: 시작 15분 전부터.
export const ENTRY_LEAD_MS = 15 * 60 * 1000;

// 개별 수업 취소 컷오프: 시작 1시간 전까지만. 과정(enrollment)당 취소 한도.
export const CANCEL_CUTOFF_MS = 60 * 60 * 1000;
export const MAX_CANCELLATIONS = 6;

// KST 날짜(YYYY-MM-DD) + 분(0~1440) → UTC epoch ms.
export function kstDateMinToMs(sessionDate: string, min: number): number {
  const [y, m, d] = sessionDate.split("-").map(Number);
  return Date.UTC(y, m - 1, d, 0, 0, 0, 0) + min * 60_000 - KST_OFFSET_MS;
}

// 입장 가능 여부: 시작 15분 전 ~ 종료 시각.
export function canEnterClass(nowMs: number, startMs: number, endMs: number): boolean {
  return nowMs >= startMs - ENTRY_LEAD_MS && nowMs <= endMs;
}

// 취소 가능 여부: 수업 시작 1시간 전까지.
export function canCancelClass(nowMs: number, startMs: number): boolean {
  return nowMs <= startMs - CANCEL_CUTOFF_MS;
}
