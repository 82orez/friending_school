// 프렙(가칭) — 프렌더 Plus 유료 강좌의 정책 상수 단일 소스.
// 개설 폼·서버 검증·표시가 모두 여기를 참조한다(난이도는 room-levels.ts를 그대로 재사용).

// 월 단위 정규 과정 — 회차 수는 고정이다(프렌더가 못 바꾼다).
export const PREP_SESSION_COUNT = 20;

// 기본 수업일 = 매주 월~금. JS getDay() 기준(0=일 … 6=토).
export const PREP_DEFAULT_WEEKDAYS = [1, 2, 3, 4, 5];

// 수강료(월 20회 기준) — 프렌더 Plus가 개설·수정 시 직접 정한다. 아래는 폼 기본값일 뿐이다.
// 강좌마다 prep_courses.price_krw에 저장되므로 이 상수를 바꿔도 기존 강좌는 영향받지 않는다.
export const PREP_DEFAULT_PRICE_KRW = 20_000;

// 입력 허용 범위. 0원(체험·무료 운영)을 막지 않고, 상한은 오타(0 하나 더 붙는 실수)를 거르는 선.
export const PREP_MIN_PRICE_KRW = 0;
export const PREP_MAX_PRICE_KRW = 1_000_000;

// 개설 가능 범위 — 첫 회차는 오늘 이후, 마지막 회차까지 이 일수 안에 들어와야 한다.
// 20회 × 평일이면 약 4주(28일)라 여유를 둔 값(연습방 ROOM_MAX_AHEAD_DAYS와 같은 성격).
export const PREP_MAX_AHEAD_DAYS = 120;

// 진행 시간 20분~2시간, 10분 단위(DB check·연습방과 동일 범위).
export const PREP_DURATIONS: number[] = [];
for (let d = 20; d <= 120; d += 10) PREP_DURATIONS.push(d);

export const PREP_DEFAULT_DURATION = 40;

// 제한 인원 — 연습방(1~100)보다 넓다. 프렙은 강의형이라 대형 정원을 허용한다.
// ⚠️ 같은 상한이 DB check(prep_courses_capacity_check)에도 있으니 바꿀 땐 마이그레이션과 함께.
export const PREP_MIN_CAPACITY = 1;
export const PREP_MAX_CAPACITY = 1000;

// 폼 기본값 — 프렙은 인원 제한을 두기보다 열어 두는 쪽이 기본이라 상한과 같은 값에서 출발한다.
export const PREP_DEFAULT_CAPACITY = PREP_MAX_CAPACITY;

// 회차 주제 — 개설 시 20개를 모두 입력해야 한다(앱이 강제, DB 컬럼은 nullable).
export const PREP_TOPIC_MAX = 100;
