// KST 날짜 문자열(YYYY-MM-DD) 유틸 — 샤우팅(prep)과 연습방 시리즈가 함께 쓴다.
// 원래 src/lib/prep.ts에 있던 것을 도메인 중립 모듈로 뽑았다(연습방이 prep 도메인 파일을
// import 하는 역결합을 피하려는 것). prep.ts는 여기서 re-export 하므로 기존 import 경로는 그대로다.
//
// 규약: **TZ 비종속** — 날짜 문자열 산술만 하고 Date는 UTC로만 다룬다
// (로컬 타임존이 끼면 KST 날짜가 하루 밀린다). 유일한 예외가 toLocalDate(캘린더 전용).

// YYYY-MM-DD → UTC 자정 Date.
function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

export const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

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

// KST 기준 오늘(YYYY-MM-DD). Intl에 타임존을 넘기므로 브라우저 로컬 TZ와 무관하다.
// ⚠️ booking.ts의 todayKst는 server-only라 클라에서 못 쓴다 — 클라용은 이 함수다.
export function kstToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

// "9월 1일"
export function fmtDateKo(dateStr: string): string {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${m}월 ${d}일`;
}

// "9월 1일 (월)" — 회차 행 제목처럼 넓은 자리.
export function fmtDateKoDow(dateStr: string): string {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${m}월 ${d}일 (${WEEKDAY_KO[weekdayOf(dateStr)]})`;
}

// "9/01(월)" — 회차 목록처럼 좁은 자리. 요일은 UTC 산술(weekdayOf)이라 TZ에 흔들리지 않는다.
export function fmtDateShort(dateStr: string): string {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${m}/${pad2(d)}(${WEEKDAY_KO[weekdayOf(dateStr)]})`;
}

// YYYY-MM-DD → **로컬 자정 Date**. 이 파일에서 유일하게 TZ에 얽힌 함수다.
// ⚠️ react-day-picker(ui/calendar)는 로컬 타임존 Date를 다룬다 — `new Date("2026-09-01")`은 UTC 파싱이라
//    KST에서 하루 앞 칸이 칠해진다. 캘린더에 날짜를 넘길 때는 반드시 이걸 쓸 것.
export function toLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// 일자(YYYY-MM-DD)가 걸친 **달 수** — 캘린더 `numberOfMonths`용. 빈 배열이면 1.
// ⚠️ Date를 만들지 않는다 — 문자열에서 연·월만 잘라 센다(UTC 파싱이 끼면 KST에서 월 경계가 밀린다).
export function monthsSpannedOf(dates: string[]): number {
  if (dates.length === 0) return 1;
  const idx = (k: string) => Number(k.slice(0, 4)) * 12 + Number(k.slice(5, 7)) - 1;
  const all = dates.map(idx);
  return Math.max(...all) - Math.min(...all) + 1;
}
