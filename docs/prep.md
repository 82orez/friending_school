# 프렙(가칭) — 프렌더 Plus 유료 강좌

> `CLAUDE.md`에서 분리된 상세 문서. 관련 문서: 프렌더 등급·연습방=`docs/friender.md`, 테이블 원문=`docs/db.md`.

무료 연습방(`friender_rooms`)이 **단발성 1회**인 것과 달리, 프렙은 **프렌더 Plus만 개설하는 월 단위 유료 정규 과정**이다. 이름은 가칭.

## 정책 (단일 소스 `src/data/prep.ts`)

- **월 `PREP_SESSION_COUNT`=20회 고정** — 프렌더가 회차 수를 못 바꾼다.
- **기본 수업일 = 매주 월~금**(`PREP_DEFAULT_WEEKDAYS`=[1..5]). 시작일을 고르면 그날부터 **평일로 20회 자동 채움**(달 경계 무관), 이후 **캘린더에서 개별 일자 조정**.
- **수강료는 프렌더 Plus가 직접 입력·수정**(월 20회 기준). 폼 기본값 `PREP_DEFAULT_PRICE_KRW`(**20,000원**), 허용 범위 `PREP_MIN_PRICE_KRW`~`PREP_MAX_PRICE_KRW`(**0~1,000,000원** — 0원 무료 운영을 막지 않고 상한은 자릿수 오타를 거르는 선). 서버가 범위를 재검증한다.
  ⚠️ 한때 "관리자 고정가"(서버가 상수로 채움)였다가 프렌더 입력으로 바뀌었다 — 값은 강좌마다 `prep_courses.price_krw`에 저장되므로 **기본값 상수를 바꿔도 기존 강좌는 영향받지 않는다**. 시작 후 강좌도 수강료는 수정 가능(잠기는 것은 일정·시각뿐).
- **정원은 프렌더가 지정**(`PREP_MIN_CAPACITY`~`PREP_MAX_CAPACITY` = **1~1000**, 그룹 가능) — 연습방(1~100)보다 넓다(강의형이라 대형 정원 허용). ⚠️ 상한이 앱 상수·서버 검증·DB check 3곳에 있으니 함께 고칠 것(`20260822005713`).
- **회차마다 주제 1개, 20개 모두 필수** — 유료 강좌라 커리큘럼이 먼저 보여야 한다. ⚠️ **주제는 날짜가 아니라 회차 번호에 귀속**된다(캘린더에서 일자를 바꿔도 "1강 주제"는 1강에 남는다) → 클라 상태는 `dates`/`topics`를 **인덱스로만 매칭**하고 `topics` 길이는 항상 20으로 고정. `prep_sessions.topic`은 **nullable**(기존 행 때문에 not null 불가)이고 필수는 **앱이 강제**한다.
- **시각은 강좌 단위 고정**(`start_min`+`duration_min`) — 조정 대상은 '일자'다. 회차별 시각 컬럼을 두지 않는다.
- 게이팅은 **`isFrienderPlusRole`**(`src/lib/auth.ts`) — 이 함수의 첫 사용처. ⚠️ **admin도 통과시키지 않는다**: 개설되면 `friender_id`가 admin이 돼 데이터가 오염된다.

## 데이터 (`20260822004501_add_prep_courses.sql`)

- **`prep_courses`** — 표시 스냅샷(`friender_name`/`friender_nickname`, 방과 같은 이유)·`title`·`description`·`level`(room-levels 재사용)·`capacity`·`start_min`(10분 배수)·`duration_min`(20~120·10분, 기본 40)·`session_count`·`price_krw`.
- **`prep_sessions`** — `course_id`·`session_no`(1..20)·`session_date`·**`topic`**(회차 주제, nullable — `20260822171327`). `unique(course_id,session_no)` + `unique(course_id,session_date)`(하루 두 회차 금지).
  ⚠️ 회차를 **JSON 배열이 아니라 행**으로 둔 이유: 앞으로 회차별 입장·출결·연기가 붙을 자리이고(`classes`가 같은 이유), 일자 조정도 행 갱신이 자연스럽다.
- RLS는 **`_select_own`만**(개설자 본인). 공개 정책은 수강신청 동선을 붙일 때 추가. 쓰기 정책 없음 → 서버 액션 service_role.

## 액션 `src/app/friender/prep-actions.ts`

`friender/actions.ts`가 커져 도메인별로 파일을 나눴다. **`requireFrienderPlus()`** 가드 후 `createPrepCourse(input)`:
검증 순서 = Plus 권한 → 제목/난이도/정원/시각/진행시간 → **회차 재검증**(정확히 20개·중복 없음·형식·전부 내일 이후·`PREP_MAX_AHEAD_DAYS`(120일) 이내·**주제 20개 모두 비어 있지 않음**) → Zoom URL 등록 여부 → insert. 입력은 **`sessions: {date, topic}[]`** 한 배열로 받는다(날짜·주제를 따로 받으면 개수가 어긋나는 상태가 생긴다). `session_no`는 날짜 오름차순 정렬 후의 배열 순서.
⚠️ **PostgREST에 트랜잭션이 없다** — `prep_sessions` insert가 실패하면 회차 없는 고아 강좌가 남으므로 **방금 만든 course를 지우는 보상 삭제**를 한다.
⚠️ `price_krw`는 **입력을 받고 서버가 범위(`PREP_MIN/MAX_PRICE_KRW`)를 재검증**한다(한때 "관리자 고정가"라 무시했었다 — 위 정책 항목 참고).

## 날짜 로직 `src/lib/prep.ts`

`buildWeekdaySessions(startDate, count)`(시작일부터 평일만 N개, 시작일이 주말이면 다음 평일부터) · `addDays` · `weekdayOf` · `isWeekday`. **순수 함수**라 폼과 서버 검증이 같이 쓴다.
⚠️ **TZ 비종속**: `Date.UTC` 산술만 쓴다(로컬 타임존이 끼면 KST 날짜가 하루 밀린다 — `addDaysKst`와 같은 이유).
**표시 헬퍼도 여기**(폼·목록·모달이 같은 라벨을 쓰도록): `kstToday()`(Intl `en-CA`+timeZone — ⚠️ `booking.ts`의 `todayKst`는 `server-only`라 클라에서 못 쓴다) · `fmtDateKo`("9월 1일") · `fmtDateShort`("9/01(월)", 요일은 `weekdayOf`라 TZ 안전) · `formatWon`.

## UI

- 탭 **「프렙 강좌」 `/friender/prep`** — `FrienderTabs`의 `plusOnly` 플래그로 Plus에게만 노출(레이아웃이 `isPlus`를 내려준다). ⚠️ **탭 숨김만으로는 부족** — page에서도 Plus 가드로 URL 직접 접근을 막는다.
- **`PrepManager`**(client): 페이지 껍데기 — 안내문·Zoom 배너 + 인라인 **개설 폼** + **내 강좌 목록**(회차·주제는 네이티브 `<details>` 아코디언 — `StudentEnrollments` 선례) + 삭제 `AlertDialog` + 수정 모달. 서버 액션 호출·`useTransition`(`pending`)·toast·`router.refresh()`를 **여기서만** 한다(폼은 값만 올려보낸다).
- **`PrepCourseForm`**(client, 개설·수정 **공용**): 강좌명·시작 시각(시/분, **기본값 없음**)·진행 시간·난이도·정원·수강료·소개·시작일 + **회차별 주제 20칸**(+ 여러 줄 **일괄 붙여넣기** 상자 → 앞에서부터 채움, `N/20` 카운터) + **회차 캘린더**(`ui/calendar`=react-day-picker `mode="multiple"`, 자동 채운 20일 표시·클릭 토글·`20/20` 카운터, 20회가 아니면 저장 버튼 비활성) + 확인 `AlertDialog`(요약 dl). 타입 `PrepCourse`(page가 import)·`PrepFormValues`(=`PrepCourseInput` 모양)의 정의처이고, `PrepManager`가 `PrepCourse`를 re-export한다.
  **폼이 자기 상태를 소유한다** → 초기값은 `initial`(없으면 빈 폼)에서 만들고, 개설 성공 후 비우기는 `PrepManager`가 `key`를 증가시켜 **재마운트**로 처리(부모가 폼 내부 상태를 건드리지 않는다). `onDirtyChange`는 **초기 스냅샷(JSON) 비교**라 "고쳤다 되돌린" 경우는 dirty가 아니다.
  ⚠️ **Calendar는 로컬 타임존 Date를 준다** — `toISOString()`으로 키를 만들면 KST에서 하루 밀린다. 로컬 연·월·일을 직접 조립(`toKey`)하고 반대 방향도 로컬 자정 Date(`toDate`)로 만든다.
  ⚠️ `AlertDialogDescription`은 `<p>`라 dl은 **바깥 형제**로, base-nova `AlertDialogAction`은 자동으로 안 닫히므로 핸들러에서 `setConfirmOpen(false)`.

## 수정·삭제

- **시작 전 강좌**(첫 회차가 미래): 개설 폼 그대로 **전부 수정**(일정·주제 포함).
- **시작 후 강좌**: **일정(날짜)·시각은 고정**, 강좌명·소개·난이도·정원·**주제**만 수정. 지나간 회차의 날짜가 바뀌는 사고를 막는다.
  ⚠️ 폼 잠금은 UX 레이어일 뿐 — **서버가 authoritative**: `updatePrepCourse`가 첫 회차로 `started`를 다시 판정하고, 우회 제출이 와도 **기존 날짜·시각으로 되돌린다**. 검증도 `validatePrepInput(input, { allowPastDates: started })`로 분기(시작 후에는 '내일 이후' 규칙을 건너뛴다 — 지난 회차가 그대로 들어오기 때문).
- **회차 교체는 `replace_prep_sessions` RPC**(`20260822183052`)로 한 트랜잭션에서 delete+insert.
  ⚠️ 순차 update가 아닌 이유 = `unique(course_id, session_date)` 때문에 **1강↔2강 날짜 맞바꾸기**가 중간 상태에서 충돌한다. delete→insert를 앱에서 하면 PostgREST에 트랜잭션이 없어 실패 시 **회차 0개 강좌**가 남는다.
  ⚠️ RPC가 `auth.uid()`로 소유권을 검증하므로 **세션 client로 호출**해야 한다(service_role로 부르면 항상 거부 — `join_friender_room`과 같은 함정).
- **삭제는 언제든 가능**(회차는 FK cascade). ⏳ 수강신청·결제가 붙으면 `deletePrepCourse`에 **"수강생이 있으면 삭제 금지"** 가드를 추가한다(연습방 `deleteRoom`의 `countParticipants`와 같은 모양 — 주석 자리 있음).
- UI는 **수정 모달 `PrepEditModal`**: 목록 행의 「수정」 → 모달에 `PrepCourseForm mode="edit"`를 그대로 싣는다(목록 안에 20개 주제+캘린더를 펼치거나 페이지 상단 개설 폼을 수정 모드로 바꾸면 스크롤이 길어져 지금 뭘 고치는지 놓친다 — 후자를 쓰다 모달로 옮겼다). 강좌마다 초기값이 달라 `key={course.id}`로 재마운트, `course === null`이면 언마운트(`RoomInfoModal` 방식).
  ⚠️ **z-index/닫기 규약**(`AvailabilityModal` 이식): 오버레이 `z-[110]`·패널 `z-[120]`·**모달 안의 `AlertDialog`는 `z-[130]`**(폼의 확인 다이얼로그는 `confirmClassName`으로 주입). Esc·오버레이 클릭은 `[role="alertdialog"]`가 떠 있으면 무시(이중 닫힘 방지), **dirty면 닫기 가드 `AlertDialog`**, `pending` 중에는 닫히지 않는다. body scroll lock + 닫기 버튼 포커스.
  ⚠️ 시작 후 강좌는 폼에서 **시작 시각(시·분) select도 함께 잠근다** — 서버가 어차피 기존 값으로 되돌리는데 입력만 열려 있으면 "바꿨는데 반영 안 된다"로 보인다.

## ⏳ 미구현 (다음 단계)

수강신청·결제·공개 목록(`/friending` 노출)·회차 입장(zoom)·연습방과의 **시간 겹침 검사**(지금은 공개·예약 동선이 없어 실제 충돌이 생기지 않는다 → 수강신청을 붙일 때 `roomsOverlap`을 확장해 함께 처리).
