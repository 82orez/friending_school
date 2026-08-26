import { PREP_DEFAULT_WEEKDAYS } from "@/data/prep";
import { kstDateMinToMs } from "@/lib/classtime";

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

// "9월 1일 (월)" — 회차 행 제목처럼 넓은 자리. 내 강의실의 정규 과정 행(formatSessionDate)과 같은 표기다.
export function fmtDateKoDow(dateStr: string): string {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${m}월 ${d}일 (${WEEKDAY_KO[weekdayOf(dateStr)]})`;
}

// "9/01(월)" — 회차 목록처럼 좁은 자리에서 쓴다. 요일은 UTC 산술(weekdayOf)이라 TZ에 흔들리지 않는다.
export function fmtDateShort(dateStr: string): string {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${m}/${pad2(d)}(${WEEKDAY_KO[weekdayOf(dateStr)]})`;
}

export function formatWon(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}

// 프렌더 표시 이름 — **이름이 기본**이고 닉네임이 있으면 괄호로 함께 보여준다("프렌더1 (최강 삼성)").
// ⚠️ 공개 화면(프렌딩 카드·호스트 프로필)은 반대로 닉네임을 앞세우는 정책이라 이 헬퍼를 쓰지 않는다 — admin 화면 전용.
export function frienderLabel(name: string | null | undefined, nickname: string | null | undefined): string {
  const n = (name ?? "").trim();
  const nick = (nickname ?? "").trim();
  if (!n) return nick || "-";
  return nick ? `${n} (${nick})` : n;
}

// YYYY-MM-DD → **로컬 자정 Date**. 이 파일에서 유일하게 TZ에 얽힌 함수다.
// ⚠️ react-day-picker(ui/calendar)는 로컬 타임존 Date를 다룬다 — `new Date("2026-09-01")`은 UTC 파싱이라
//    KST에서 하루 앞 칸이 칠해진다. 캘린더에 날짜를 넘길 때는 반드시 이걸 쓸 것(개설 폼·admin 심사 공용).
export function toLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
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

// ── 중도 수강신청 — 잔여 회차와 비례 요금 ────────────────────────────────
// ⚠️ **같은 공식이 RPC join_prep_course에도 있다**(20260826003601). 서버(RPC)가 authoritative고
//    여기는 배너·모달의 사전 표시용이라, 한쪽만 고치면 "보여준 금액과 청구액이 다르다"가 된다.

// 남은 회차 = **종료 시각이 미래인 회차**. 날짜 비교(session_date >= 오늘)를 쓰지 않는 이유:
// 06:00~06:40 강좌를 23시에 신청하면 오늘 회차는 이미 못 듣는데 날짜로 세면 그 회차까지 청구된다.
// 입장 시간창(canEnterClass: 시작 15분 전~종료)과 같은 경계라 "샀는데 못 들어가는 회차"가 안 생긴다.
export function prepRemainingSessions(dates: string[], startMin: number, durationMin: number, nowMs: number = Date.now()): string[] {
  return dates.filter((d) => kstDateMinToMs(d, startMin + durationMin) > nowMs).sort();
}

// 1회 단가 — **절사**. 반올림하면 나누어떨어지지 않는 가격에서 1회분이 정가 비율보다 비싸진다.
export function prepUnitKrw(priceKrw: number, total: number): number {
  return total > 0 ? Math.floor(priceKrw / total) : 0;
}

// 잔여 비례 청구액 = 단가 × 남은 회차.
// ⚠️ 남은 회차 = 전체 회차이면 **원값 그대로** — 시작 전 신청자가 절사 누적으로 정가보다 싸지면 안 된다.
export function prepChargeKrw(priceKrw: number, total: number, remaining: number): number {
  if (total <= 0 || remaining >= total) return priceKrw;
  return prepUnitKrw(priceKrw, total) * remaining;
}

// SMS에 강좌명을 그대로 넣으면 100자짜리 제목이 문자를 잡아먹는다 — 30자에서 자른다.
// admin 심사 통보와 수강신청 알림이 함께 쓴다.
export function prepSmsTitle(title: string): string {
  return title.length > 30 ? `${title.slice(0, 30)}…` : title;
}
