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

// ── 수강신청 접수 시간창 ────────────────────────────────────────────────
// KST 07:00~19:00에만 신청을 받는다(19:00부터 익일 07:00까지 마감).
// 신청은 곧바로 신청자에게 입금 안내 SMS, 관리자 메일, 프렌더 SMS를 띄우므로
// 심야 접수는 심야 문자 발송 + 응대 불가 시간대의 입금 대조를 뜻한다.
// ⚠️ 같은 값이 RPC join_prep_course에도 하드코딩돼 있다 — RPC는 authenticated에 grant돼
//    브라우저가 직접 부를 수 있어 자급해야 한다(NO_SHOW_GRACE_MIN과 같은 사정). 바꿀 땐 함께.
export const PREP_APPLY_OPEN_MIN = 7 * 60;
export const PREP_APPLY_CLOSE_MIN = 19 * 60;

// 배너 안내와 서버 액션 에러 문구가 어긋나지 않도록 문장도 여기 한 곳에 둔다.
export const PREP_APPLY_WINDOW_LABEL = "오전 7시~오후 7시";
export const PREP_APPLY_CLOSED_MSG = `수강신청은 매일 ${PREP_APPLY_WINDOW_LABEL}에만 가능합니다.`;

// ── 입금 기한 ───────────────────────────────────────────────────────────
// 신청 당일 KST 21:00. 접수 시간창이 07:00~19:00이라 기한은 항상 신청 시점보다 뒤다(경계 예외 없음).
// 입금하지 않는 신청이 `입금대기`로 남으면 정원(status <> '취소')을 계속 잡아먹기 때문에 조건을 신청 동선에 명시한다.
// ⚠️ **판정·자동 취소는 미구현** — 기한이 지난 신청은 관리자가 /admin/prep-enrollments에서 직접 취소한다.
//    문구와 동작이 어긋나지 않으려면 그 운영이 전제다(자동화 조건은 docs/prep.md).
export const PREP_PAYMENT_DEADLINE_LABEL = "오후 9시";
export const PREP_PAYMENT_DEADLINE_MSG = `신청일 당일 ${PREP_PAYMENT_DEADLINE_LABEL}까지 입금이 확인되지 않으면 신청이 자동으로 취소됩니다.`;

// ── 개설 심사 상태 ──────────────────────────────────────────────────────
// 작성중(초안) → 신청(심사 대기) → 승인 | 거절. DB enum prep_course_status와 같은 값이다.
// ⚠️ 프렌더 화면(PrepManager)과 admin 화면(PrepCoursesManager)이 같은 라벨·색을 쓰도록 여기 한 곳에 둔다.
export const PREP_STATUSES = ["작성중", "신청", "승인", "거절"] as const;
export type PrepStatus = (typeof PREP_STATUSES)[number];

// 심사 중인 것은 "신청"보다 "심사 중"이 사용자 언어에 가깝다(프렌더 지원 목록과 동일).
export const PREP_STATUS_LABEL: Record<PrepStatus, string> = {
  작성중: "작성중",
  신청: "심사 중",
  승인: "승인",
  거절: "거절",
};

// FrienderRequestsManager의 STATUS_BADGE 색을 그대로 쓰고 '작성중'만 더했다.
export const PREP_STATUS_BADGE: Record<PrepStatus, string> = {
  작성중: "bg-surface text-muted-fg",
  신청: "bg-[#FFF7E6] text-[#B97400]",
  승인: "bg-[#E1F5EE] text-[#0F6E56]",
  거절: "bg-brand/10 text-brand",
};

// 명시적 「승인 요청」으로만 '신청'이 되는 상태(승인은 수정 시 자동 복귀라 여기 없다).
export const PREP_REQUESTABLE_STATUSES: PrepStatus[] = ["작성중", "거절"];

// ── 수강신청 상태 ──────────────────────────────────────────────────────
// DB enum prep_enrollment_status. ⚠️ prep_courses.status의 '신청'(개설 심사)과는 다른 축이다.
export const PREP_ENROLLMENT_STATUSES = ["입금대기", "수강확정", "취소"] as const;
export type PrepEnrollmentStatus = (typeof PREP_ENROLLMENT_STATUSES)[number];

export const PREP_ENROLLMENT_LABEL: Record<PrepEnrollmentStatus, string> = { 입금대기: "입금 대기", 수강확정: "수강 확정", 취소: "취소" };

// PrepCourseInfoModal이 하드코딩하던 색을 그대로 옮겼다(관리자 화면끼리 같은 색이어야 한다).
// ⚠️ 학생용 ENROLLMENT_STATUS_BADGE(src/data/enrollment-status.ts)와는 계열이 다르다 — 그쪽은 정규 과정과 나란히 놓이는 화면이라 별개로 둔다.
export const PREP_ENROLLMENT_BADGE: Record<PrepEnrollmentStatus, string> = {
  입금대기: "bg-[#FFF7E6] text-[#B97400]",
  수강확정: "bg-[#E1F5EE] text-[#0F6E56]",
  취소: "bg-surface text-muted-fg",
};

// **표시 전용** — DB 상태는 여전히 '취소'다(환불이어도 enum 값은 늘리지 않는다, 정규 과정과 같은 판단).
// 취소 + payments에 환불 기록이 있으면 이 배지를 쓴다. 색은 학생 화면 「환불됨」(enrollment-status.ts)과 같은 호박색.
export const PREP_REFUND_LABEL = "환불";
export const PREP_REFUND_BADGE = "bg-[#FFF4E5] text-[#B45309]";
