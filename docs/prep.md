# 프렙(가칭) — 프렌더 Plus 유료 강좌

> `CLAUDE.md`에서 분리된 상세 문서. 관련 문서: 프렌더 등급·연습방=`docs/friender.md`, 테이블 원문=`docs/db.md`.

무료 연습방(`friender_rooms`)이 **단발성 1회**인 것과 달리, 프렙은 **프렌더 Plus만 개설하는 월 단위 유료 정규 과정**이다. 이름은 가칭.

## 정책 (단일 소스 `src/data/prep.ts`)

- **월 `PREP_SESSION_COUNT`=20회 고정** — 프렌더가 회차 수를 못 바꾼다.
- **기본 수업일 = 매주 월~금**(`PREP_DEFAULT_WEEKDAYS`=[1..5]). 시작일을 고르면 그날부터 **평일로 20회 자동 채움**(달 경계 무관), 이후 **캘린더에서 개별 일자 조정**.
- **수강료 = 관리자 고정가**(`PREP_MONTHLY_PRICE_KRW`) — 프렌더는 입력하지 않고 **서버가 상수로 채운다**. 현재 **월 20,000원**(20회 기준). 값을 바꾸면 이후 개설분부터 적용. 상수가 바뀌어도 기존 강좌는 개설 시점 값을 유지하도록 `prep_courses.price_krw`에 **스냅샷** 저장(`payments`·`rates` 이력과 같은 사고).
- **정원은 프렌더가 지정**(`PREP_MIN_CAPACITY`~`PREP_MAX_CAPACITY` = **1~1000**, 그룹 가능) — 연습방(1~100)보다 넓다(강의형이라 대형 정원 허용). ⚠️ 상한이 앱 상수·서버 검증·DB check 3곳에 있으니 함께 고칠 것(`20260822005713`).
- **시각은 강좌 단위 고정**(`start_min`+`duration_min`) — 조정 대상은 '일자'다. 회차별 시각 컬럼을 두지 않는다.
- 게이팅은 **`isFrienderPlusRole`**(`src/lib/auth.ts`) — 이 함수의 첫 사용처. ⚠️ **admin도 통과시키지 않는다**: 개설되면 `friender_id`가 admin이 돼 데이터가 오염된다.

## 데이터 (`20260822004501_add_prep_courses.sql`)

- **`prep_courses`** — 표시 스냅샷(`friender_name`/`friender_nickname`, 방과 같은 이유)·`title`·`description`·`level`(room-levels 재사용)·`capacity`·`start_min`(10분 배수)·`duration_min`(20~120·10분, 기본 40)·`session_count`·`price_krw`.
- **`prep_sessions`** — `course_id`·`session_no`(1..20)·`session_date`. `unique(course_id,session_no)` + `unique(course_id,session_date)`(하루 두 회차 금지).
  ⚠️ 회차를 **JSON 배열이 아니라 행**으로 둔 이유: 앞으로 회차별 입장·출결·연기가 붙을 자리이고(`classes`가 같은 이유), 일자 조정도 행 갱신이 자연스럽다.
- RLS는 **`_select_own`만**(개설자 본인). 공개 정책은 수강신청 동선을 붙일 때 추가. 쓰기 정책 없음 → 서버 액션 service_role.

## 액션 `src/app/friender/prep-actions.ts`

`friender/actions.ts`가 커져 도메인별로 파일을 나눴다. **`requireFrienderPlus()`** 가드 후 `createPrepCourse(input)`:
검증 순서 = Plus 권한 → 제목/난이도/정원/시각/진행시간 → **회차 일자 재검증**(정확히 20개·중복 없음·형식·전부 내일 이후·`PREP_MAX_AHEAD_DAYS`(120일) 이내) → Zoom URL 등록 여부 → insert.
⚠️ **PostgREST에 트랜잭션이 없다** — `prep_sessions` insert가 실패하면 회차 없는 고아 강좌가 남으므로 **방금 만든 course를 지우는 보상 삭제**를 한다.
⚠️ `price_krw`는 **입력을 받지 않는다**(클라가 보내도 무시) — 관리자 고정가 정책.

## 날짜 로직 `src/lib/prep.ts`

`buildWeekdaySessions(startDate, count)`(시작일부터 평일만 N개, 시작일이 주말이면 다음 평일부터) · `addDays` · `weekdayOf` · `isWeekday`. **순수 함수**라 폼과 서버 검증이 같이 쓴다.
⚠️ **TZ 비종속**: `Date.UTC` 산술만 쓴다(로컬 타임존이 끼면 KST 날짜가 하루 밀린다 — `addDaysKst`와 같은 이유).

## UI

- 탭 **「프렙 강좌」 `/friender/prep`** — `FrienderTabs`의 `plusOnly` 플래그로 Plus에게만 노출(레이아웃이 `isPlus`를 내려준다). ⚠️ **탭 숨김만으로는 부족** — page에서도 Plus 가드로 URL 직접 접근을 막는다.
- **`PrepManager`**(client): 개설 폼(강좌명·시작 시각(시/분, **기본값 없음**)·진행 시간·난이도·정원·소개·시작일) + **회차 캘린더**(`ui/calendar`=react-day-picker `mode="multiple"`, 자동 채운 20일 표시·클릭 토글·`20/20` 카운터, 20회가 아니면 개설 버튼 비활성) + 개설 확인 `AlertDialog`(요약 dl) + 내 강좌 목록.
  ⚠️ **Calendar는 로컬 타임존 Date를 준다** — `toISOString()`으로 키를 만들면 KST에서 하루 밀린다. 로컬 연·월·일을 직접 조립(`toKey`)하고 반대 방향도 로컬 자정 Date(`toDate`)로 만든다.
  ⚠️ `AlertDialogDescription`은 `<p>`라 dl은 **바깥 형제**로, base-nova `AlertDialogAction`은 자동으로 안 닫히므로 핸들러에서 `setConfirmOpen(false)`.

## ⏳ 미구현 (다음 단계)

수강신청·결제·공개 목록(`/friending` 노출)·회차 입장(zoom)·강좌 수정/삭제·연습방과의 **시간 겹침 검사**(지금은 공개·예약 동선이 없어 실제 충돌이 생기지 않는다 → 수강신청을 붙일 때 `roomsOverlap`을 확장해 함께 처리).
