// 프렌더 무료 연습방 "시리즈" 정책 상수 단일 소스 — 개설 폼·서버 검증·표시가 모두 참조한다.
// (난이도는 room-levels.ts, 진행 시간·정원·제목 길이는 room-actions.ts의 기존 상수를 그대로 쓴다.)

// 운영 기간(주). 프렌더가 고르고, 기본은 4주.
export const ROOM_MIN_WEEKS = 1;
export const ROOM_MAX_WEEKS = 8;
export const ROOM_DEFAULT_WEEKS = 4;

export const ROOM_WEEK_OPTIONS: number[] = [];
for (let w = ROOM_MIN_WEEKS; w <= ROOM_MAX_WEEKS; w++) ROOM_WEEK_OPTIONS.push(w);

// 주간 스케줄 요일. `value`는 JS getDay() 기준(0=일 … 6=토) — prep의 PREP_DEFAULT_WEEKDAYS와 같은 축.
// ⚠️ **배열 순서 = 표시 순서(월~일)** 이고 value 순서가 아니다: 수업 요일은 주 초(월)부터 고르는 것이
//    자연스러워 일요일을 맨 뒤로 보냈다. 요일 라벨(weekdaysLabelOf)도 이 순서를 따라야 하므로
//    정렬 키는 value가 아니라 `roomWeekdayOrder`다.
// ⚠️ 기본 선택값을 두지 않는다(시작 시각과 같은 이유) — 실제 약속 요일이라 확인 없이 제출되면 안 된다.
export const ROOM_WEEKDAYS = [
  { value: 1, ko: "월" },
  { value: 2, ko: "화" },
  { value: 3, ko: "수" },
  { value: 4, ko: "목" },
  { value: 5, ko: "금" },
  { value: 6, ko: "토" },
  { value: 0, ko: "일" },
] as const;

// 표시 정렬 키 — 월(0) … 토(5) … 일(6). getDay() 값을 월요일 시작으로 회전시킨 것.
export const roomWeekdayOrder = (value: number): number => (value + 6) % 7;

// 한 번에 개설할 수 있는 회차 수 상한 = 8주 × 매일 = 56. 서버가 재검증한다.
// (기존 개설 상한 ROOM_MAX_AHEAD_DAYS=90일 안에 들어가므로 그 상수는 그대로 둔다.)
export const ROOM_MAX_SESSIONS = ROOM_MAX_WEEKS * 7;

// 회차별 주제 — 무료 연습방이라 **비워 둬도 개설된다**(샤우팅은 20개 전부 필수).
export const ROOM_TOPIC_MAX = 100;

// 연습방 게시판 — 상세 모달 「게시판」 탭. ⚠️ 길이 2종은 **DB check와 같은 값**이고
// 클라 maxLength와 서버 slice가 함께 본다(샤우팅 PREP_BOARD_* 와 같은 규약·같은 값).
export const ROOM_BOARD_POST_MAX = 1000;
export const ROOM_BOARD_COMMENT_MAX = 300;

// 일반 글 커서 페이징 크기(공지는 전량 내려온다).
export const ROOM_BOARD_PAGE_SIZE = 20;
