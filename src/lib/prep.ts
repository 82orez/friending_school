import { PREP_APPLY_CLOSE_MIN, PREP_APPLY_OPEN_MIN, PREP_DEFAULT_WEEKDAYS, PREP_PAYMENT_DEADLINE_LABEL } from "@/data/prep";
import { KST_OFFSET_MS, kstDateMinToMs } from "@/lib/classtime";
import { addDays, fmtDateKo, weekdayOf } from "@/lib/date-kst";

// 프렙 회차 날짜 계산 — 개설 폼과 서버 검증이 같은 규칙을 쓰도록 한 곳에 모은다.
// 순수 로직(server-only 아님), TZ 비종속: 날짜 문자열 산술만 하고 Date는 UTC로만 다룬다.
//
// ⚠️ 날짜 문자열 유틸 자체는 **`@/lib/date-kst`로 옮겼다**(연습방 시리즈와 공용). 기존 호출부가
//    깨지지 않도록 여기서 그대로 re-export 한다 — 새 코드는 date-kst에서 직접 import 할 것.
export { addDays, fmtDateKo, fmtDateKoDow, fmtDateShort, kstToday, monthsSpannedOf, toDateStr, toLocalDate, weekdayOf } from "@/lib/date-kst";

export function isWeekday(dateStr: string): boolean {
  return PREP_DEFAULT_WEEKDAYS.includes(weekdayOf(dateStr));
}

// ── 수강신청 접수 시간창 ────────────────────────────────────────────────
// ⚠️ authoritative는 RPC join_prep_course의 같은 판정이다(브라우저가 RPC를 직접 부를 수 있다).
//    여기는 서버 액션의 선검사 + 배너의 사전 안내용이라 두 곳이 같은 경계를 써야 한다.

// KST 자정 기준 분(0~1439). Intl 파싱 없이 산술만 — 이 파일의 TZ 비종속 규약을 따른다.
export function kstMinuteOfDay(nowMs: number = Date.now()): number {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor(((((nowMs + KST_OFFSET_MS) % dayMs) + dayMs) % dayMs) / 60_000);
}

// 11:00 정각은 개시, 19:00 정각은 마감(반개구간) — SQL의 `hour not between 11 and 18`과 같은 결론.
export function isPrepApplyOpen(nowMs: number = Date.now()): boolean {
  const m = kstMinuteOfDay(nowMs);
  return m >= PREP_APPLY_OPEN_MIN && m < PREP_APPLY_CLOSE_MIN;
}

// "8월 28일 오후 9시" — 신청 시각(ISO)이 속한 **KST 날짜**의 입금 기한.
// ⚠️ 기준은 조회 시점이 아니라 신청 행의 created_at이다 — 마이페이지를 다음 날 열어도 기한 날짜가 따라 움직이면 안 된다.
// kstToday()와 같은 toLocaleDateString("en-CA", …) 방식이라 서버·클라 로컬 TZ와 무관하다.
export function prepPaymentDeadlineLabel(createdAtIso: string): string {
  const d = new Date(createdAtIso);
  if (Number.isNaN(d.getTime())) return `신청 당일 ${PREP_PAYMENT_DEADLINE_LABEL}`;
  return `${fmtDateKo(d.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }))} ${PREP_PAYMENT_DEADLINE_LABEL}`;
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
