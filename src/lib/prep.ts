import { PREP_DEFAULT_WEEKDAYS } from "@/data/prep";

// 프렙 회차 날짜 계산 — 개설 폼과 서버 검증이 같은 규칙을 쓰도록 한 곳에 모은다.
// 순수 로직(server-only 아님), TZ 비종속: 날짜 문자열 산술만 하고 Date는 UTC로만 다룬다
// (로컬 타임존이 끼면 KST 날짜가 하루 밀린다 — friender/actions.ts의 addDaysKst와 같은 이유).

// YYYY-MM-DD → UTC 자정 Date.
function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(dateStr: string, days: number): string {
  const d = parseDate(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateStr(d);
}

// 0=일 … 6=토 (JS getDay와 같은 값. UTC 기준이라 TZ에 흔들리지 않는다).
export function weekdayOf(dateStr: string): number {
  return parseDate(dateStr).getUTCDay();
}

export function isWeekday(dateStr: string): boolean {
  return PREP_DEFAULT_WEEKDAYS.includes(weekdayOf(dateStr));
}

// 시작일부터 평일(월~금)만 골라 count개. 시작일이 주말이면 다음 평일부터 센다.
// 무한 루프 방지를 위해 탐색 상한을 둔다(count의 3배 일수면 주말을 감안해도 충분).
export function buildWeekdaySessions(startDate: string, count: number): string[] {
  const out: string[] = [];
  let cursor = startDate;
  for (let i = 0; out.length < count && i < count * 3 + 14; i++) {
    if (isWeekday(cursor)) out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}
