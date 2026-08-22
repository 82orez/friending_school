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

// ── 표시용 ──────────────────────────────────────────────────────────────
// 개설 폼과 강좌 목록이 같은 라벨을 쓰도록 여기 모은다(booking.ts의 todayKst는 server-only라 클라에서 못 쓴다).

const pad2 = (n: number): string => String(n).padStart(2, "0");

// KST 기준 오늘(YYYY-MM-DD). Intl에 타임존을 넘기므로 브라우저 로컬 TZ와 무관하다.
export function kstToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

// "9월 1일"
export function fmtDateKo(dateStr: string): string {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${m}월 ${d}일`;
}

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

// "9/01(월)" — 회차 목록처럼 좁은 자리에서 쓴다. 요일은 UTC 산술(weekdayOf)이라 TZ에 흔들리지 않는다.
export function fmtDateShort(dateStr: string): string {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${m}/${pad2(d)}(${WEEKDAY_KO[weekdayOf(dateStr)]})`;
}

export function formatWon(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
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
