// 프렙(가칭) — 프렌더 Plus 유료 강좌의 정책 상수 단일 소스.
// 개설 폼·서버 검증·표시가 모두 여기를 참조한다(난이도는 room-levels.ts를 그대로 재사용).

// 월 단위 정규 과정 — 회차 수는 고정이다(프렌더가 못 바꾼다).
export const PREP_SESSION_COUNT = 20;

// 기본 수업일 = 매주 월~금. JS getDay() 기준(0=일 … 6=토).
export const PREP_DEFAULT_WEEKDAYS = [1, 2, 3, 4, 5];

// 수강료 = 관리자가 정한 고정가(프렌더 입력 불가). 월 20회 기준.
// 값을 바꾸면 이후 개설분부터 적용된다 — 기존 강좌는 개설 시점 값을 prep_courses.price_krw로 스냅샷해 유지한다.
// admin 설정 화면으로 옮길 때도 이 상수가 기본값 자리가 된다.
export const PREP_MONTHLY_PRICE_KRW = 20_000;

// 개설 가능 범위 — 첫 회차는 오늘 이후, 마지막 회차까지 이 일수 안에 들어와야 한다.
// 20회 × 평일이면 약 4주(28일)라 여유를 둔 값(연습방 ROOM_MAX_AHEAD_DAYS와 같은 성격).
export const PREP_MAX_AHEAD_DAYS = 120;

// 진행 시간 20분~2시간, 10분 단위(DB check·연습방과 동일 범위).
export const PREP_DURATIONS: number[] = [];
for (let d = 20; d <= 120; d += 10) PREP_DURATIONS.push(d);

export const PREP_DEFAULT_DURATION = 60;
