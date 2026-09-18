import { ROOM_WEEKDAYS, roomWeekdayOrder } from "@/data/room-series";
import { addDays, weekdayOf } from "@/lib/date-kst";

// 연습방 시리즈의 회차 날짜 계산 — 개설 폼과 서버 검증이 같은 규칙을 쓰도록 한 곳에 모은다.
// 순수 함수(클라/서버 공용), TZ 비종속: date-kst의 문자열 산술만 쓴다.

// 시작일(포함)부터 weeks×7일 동안, 고른 요일에 해당하는 날짜만 오름차순으로.
// 예: 2026-09-01(화) + [1,3,5] + 4주 → 그 4주 안의 월·수·금 전부.
// ⚠️ 샤우팅의 buildWeekdaySessions(회차 수를 채울 때까지 전진)와 반대 방향이다 — 여기서는
//    **기간이 먼저**고 회차 수가 요일 선택에 따라 결정된다(주 3일 4주 = 12회).
export function buildWeeklySessions(startDate: string, weekdays: number[], weeks: number): string[] {
  if (!startDate || weekdays.length === 0 || weeks <= 0) return [];
  const picked = new Set(weekdays);
  const out: string[] = [];
  const total = weeks * 7;
  let cursor = startDate;
  for (let i = 0; i < total; i++) {
    if (picked.has(weekdayOf(cursor))) out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

// 시리즈 그룹핑 키 — 전환 이전 단발 방은 series_id가 null이라 자기 id가 곧 키(1회차 시리즈).
// ⚠️ 그룹핑하는 모든 화면(프렌더 방 관리·홈·마이페이지)이 이 한 함수를 쓴다.
export function seriesKeyOf(row: { id: string; series_id?: string | null }): string {
  return row.series_id ?? row.id;
}

// "월·수·금" — 컬럼이 아니라 **회차 날짜에서 파생**한다(회차를 개별 삭제·이동해도 표시가 따라온다).
// ⚠️ 정렬은 getDay() 값이 아니라 `roomWeekdayOrder`(월 시작) — 요일 선택 버튼과 같은 순서라야
//    "월·수·일"처럼 읽힌다(값으로 정렬하면 일요일이 맨 앞으로 튄다).
export function weekdaysLabelOf(dates: string[]): string {
  const days = Array.from(new Set(dates.map(weekdayOf))).sort((a, b) => roomWeekdayOrder(a) - roomWeekdayOrder(b));
  return days.map((d) => ROOM_WEEKDAYS.find((w) => w.value === d)?.ko ?? "").join("·");
}
