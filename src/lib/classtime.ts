// 화상수업 클래스 입장 시간창 공유 모델 — 클래스 페이지(표시)·입장 액션(서버 강제) 공용.
// session_date(KST 날짜 YYYY-MM-DD) + 분(자정 기준)을 절대 시각(epoch ms)으로 변환.
// 한국은 DST가 없어 KST=UTC+9 고정 오프셋으로 계산(앱 전반의 KST 문자열 관례와 일관).

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 수업 시작 가능 시점: 시작 15분 전부터.
export const ENTRY_LEAD_MS = 15 * 60 * 1000;

// KST 날짜(YYYY-MM-DD) + 분(0~1440) → UTC epoch ms.
export function kstDateMinToMs(sessionDate: string, min: number): number {
  const [y, m, d] = sessionDate.split("-").map(Number);
  return Date.UTC(y, m - 1, d, 0, 0, 0, 0) + min * 60_000 - KST_OFFSET_MS;
}

// 입장 가능 여부: 시작 15분 전 ~ 종료 시각.
export function canEnterClass(nowMs: number, startMs: number, endMs: number): boolean {
  return nowMs >= startMs - ENTRY_LEAD_MS && nowMs <= endMs;
}
