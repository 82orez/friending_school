# 프렙(가칭) — 프렌더 Plus 유료 강좌

> `CLAUDE.md`에서 분리된 상세 문서. 관련 문서: 프렌더 등급·연습방=`docs/friender.md`, 테이블 원문=`docs/db.md`.

무료 연습방(`friender_rooms`)이 **단발성 1회**인 것과 달리, 프렙은 **프렌더 Plus만 개설하는 월 단위 유료 정규 과정**이다. 이름은 가칭.

## 정책 (단일 소스 `src/data/prep.ts`)

- **월 `PREP_SESSION_COUNT`=20회 고정** — 프렌더가 회차 수를 못 바꾼다.
- **기본 수업일 = 매주 월~금**(`PREP_DEFAULT_WEEKDAYS`=[1..5]). 시작일을 고르면 그날부터 **평일로 20회 자동 채움**(달 경계 무관), 이후 **캘린더에서 개별 일자 조정**. ⚠️ **첫 수업은 내일 이후만**(오늘 불가) — 서버가 `sessions[0].date <= todayKst()`를 반려하고("첫 수업은 내일 이후로 잡아 주세요.") 승인 시 admin이 재검증한다. 폼은 **`minDate = addDays(kstToday(), 1)` 한 값**으로 시작일 `<input type="date" min>`·회차 캘린더 `disabled.before`·수동 선택 필터(`k >= minDate`)를 모두 게이팅한다 — ⚠️ 한때 셋이 `today` 기준이라 오늘이 눌렸고, 시작일로 고르면 저장에서 반려되거나 캘린더에서 고르면 회차가 조용히 19개로 빠져 사용자가 이유를 몰랐다(실제 피드백).
- **수강료는 프렌더 Plus가 직접 입력·수정**(월 20회 기준). 폼 기본값 `PREP_DEFAULT_PRICE_KRW`(**20,000원**), 허용 범위 `PREP_MIN_PRICE_KRW`~`PREP_MAX_PRICE_KRW`(**0~1,000,000원** — 0원 무료 운영을 막지 않고 상한은 자릿수 오타를 거르는 선). 서버가 범위를 재검증한다.
  ⚠️ 한때 "관리자 고정가"(서버가 상수로 채움)였다가 프렌더 입력으로 바뀌었다 — 값은 강좌마다 `prep_courses.price_krw`에 저장되므로 **기본값 상수를 바꿔도 기존 강좌는 영향받지 않는다**. ⚠️ **시작된 강좌는 수강료도 잠긴다**(아래 「수정·삭제」 — 진행 중 조건 변경 금지).
- **정원은 프렌더가 지정**(`PREP_MIN_CAPACITY`~`PREP_MAX_CAPACITY` = **1~1000**, 그룹 가능) — 연습방(1~100)보다 넓다(강의형이라 대형 정원 허용). ⚠️ 상한이 앱 상수·서버 검증·DB check 3곳에 있으니 함께 고칠 것(`20260822005713`).
- **회차마다 주제 1개, 승인 요청 시 20개 모두 필수** — 유료 강좌라 커리큘럼이 먼저 보여야 한다. ⚠️ **초안(`작성중`)·`거절` 상태에서는 비운 채 저장할 수 있다**(20칸을 나눠 채우는 동선). 완결 강제 지점은 `requestPrepReview`와 `신청`/`승인` 강좌 수정. ⚠️ **주제는 날짜가 아니라 회차 번호에 귀속**된다(캘린더에서 일자를 바꿔도 "1강 주제"는 1강에 남는다) → 클라 상태는 `dates`/`topics`를 **인덱스로만 매칭**하고 `topics` 길이는 항상 20으로 고정. `prep_sessions.topic`은 **nullable**(기존 행 때문에 not null 불가)이고 필수는 **앱이 강제**한다.
- **시각은 강좌 단위 고정**(`start_min`+`duration_min`) — 조정 대상은 '일자'다. 회차별 시각 컬럼을 두지 않는다.
- 게이팅은 **`isFrienderPlusRole`**(`src/lib/auth.ts`) — 이 함수의 첫 사용처. ⚠️ **admin도 통과시키지 않는다**: 개설되면 `friender_id`가 admin이 돼 데이터가 오염된다.

## 개설 심사 (상태 기계 · `20260822224242_add_prep_course_review.sql`)

**저장했다고 개설이 아니다** — 관리자가 승인해야 개설 완료다(유료 상품이라 수강료·커리큘럼·일정에 검토 지점이 필요했다). 값은 강사/프렌더 지원 심사와 같은 한국어 enum `prep_course_status`.

| 상태     | 뜻                      | 프렌더                                                                      | 관리자        |
| -------- | ----------------------- | --------------------------------------------------------------------------- | ------------- |
| `작성중` | 저장만 된 초안(기본값)  | 수정·삭제·**승인 요청**(20/20·Zoom·첫 회차 미래일 때만)                     | 열람만        |
| `신청`   | 심사 대기               | 수정(상태 유지·**메일 없음**)·삭제                                          | **승인/거절** |
| `승인`   | 개설 완료               | **심사 대상 항목**을 바꾸면 `신청` 복귀(+재알림)·소개/주제는 자유 수정·삭제 | 열람          |
| `거절`   | 반려(`admin_note`=사유) | 수정·**승인 다시 요청**·삭제                                                | 열람          |

- 한 줄 규칙: **`작성중`/`거절`은 명시적 버튼(`requestPrepReview`)으로만 `신청`이 되고, `승인`은 심사 대상 항목이 바뀔 때만 내려간다**(심사한 내용과 실제 강좌가 어긋나면 안 되므로).
- **심사 대상 항목 = 수강료·수업 일자·시작 시각·진행 시간·정원·난이도·강좌명**. **강좌 소개와 회차 주제는 자유 수정**(승인 유지).
  ⚠️ 한때 _모든_ 수정이 승인을 해제했는데, 주제 오타 하나에 재심사가 걸려 커리큘럼을 다듬을 수 없었다 → 값 비교(`materialChanged`)로 바꿨다. 판정은 **서버 `updatePrepCourse`가 authoritative**이고 폼의 `willRevoke`는 같은 규칙의 사전 안내다. 서버가 결과를 **`{ok, reReview}`**로 돌려줘 토스트 문구가 실제와 어긋나지 않는다.
- **관리자 알림은 메일**(`sendPrepCourseReviewRequestNotification` + `getAdminEmails()`), **프렌더 결과 통보는 SMS**(프렌더 도메인 관례 — `docs/friender.md`). 둘 다 best-effort.
- ⚠️ **메일은 상태가 `신청`으로 바뀔 때만** 보낸다 — 심사 중 강좌를 여러 번 고쳐도 관리자 메일함이 넘치지 않는다.
- ⚠️ **`started`(심사 조건 잠금) 판정에 상태가 들어간다**: `status === '승인' && 첫 회차 <= 오늘`. 초안이 묵는 사이 첫 회차가 지났다고 잠그면 일정을 다시 못 잡아 **영영 요청할 수 없는 강좌**가 된다(클라 `PrepManager.startedOf`·서버 `updatePrepCourse` 양쪽 같은 식).

## 데이터 (`20260822004501_add_prep_courses.sql`)

- **`prep_courses`** — 표시 스냅샷(`friender_name`/`friender_nickname`, 방과 같은 이유)·`title`·`description`·`level`(room-levels 재사용)·`capacity`·`start_min`(10분 배수)·`duration_min`(20~120·10분, 기본 40)·`session_count`·`price_krw`.
  **심사 컬럼(`20260822224242`)**: `status`(enum `prep_course_status`, 기본 `작성중`)·`admin_note`(거절 사유)·`submitted_at`(마지막 승인 요청)·`reviewed_at`(마지막 처리) + 인덱스 `(status, created_at desc)`. ⚠️ 백필은 **UPDATE가 아니라 기본값 스왑**(`add column ... default '승인'` → `alter column ... set default '작성중'`) — `prep_courses_set_updated_at` 트리거가 전 행의 `updated_at`을 덮어쓰기 때문.
- **`prep_sessions`** — `course_id`·`session_no`(1..20)·`session_date`·**`topic`**(회차 주제, nullable — `20260822171327`). `unique(course_id,session_no)` + `unique(course_id,session_date)`(하루 두 회차 금지).
  ⚠️ 회차를 **JSON 배열이 아니라 행**으로 둔 이유: 앞으로 회차별 입장·출결·연기가 붙을 자리이고(`classes`가 같은 이유), 일자 조정도 행 갱신이 자연스럽다.
- RLS는 **`_select_own`만**(개설자 본인). 공개 정책은 수강신청 동선을 붙일 때 추가. 쓰기 정책 없음 → 서버 액션 service_role.

## 액션 `src/app/friender/prep-actions.ts`

`friender/actions.ts`가 커져 도메인별로 파일을 나눴다. 모두 **`requireFrienderPlus()`** 가드 + service_role + `.eq("friender_id", userId)` 이중 스코프, 끝에 `revalidatePrep()`(=`/friender` layout + `/admin/prep`).

- **`createPrepCourse(input)` → `{ok, id}`** — 항상 **`status:'작성중'`** 으로 insert(저장=초안, 심사는 별도 버튼). 검증 순서 = Plus 권한 → 제목/난이도/정원/수강료/시각/진행시간 → **회차 재검증**(정확히 20개·중복 없음·형식·전부 내일 이후·`PREP_MAX_AHEAD_DAYS`(120일) 이내) → insert. 입력은 **`sessions: {date, topic}[]`** 한 배열(날짜·주제를 따로 받으면 개수가 어긋난다), `session_no`는 날짜 오름차순 정렬 후 배열 순서. 빈 주제는 **`null`로 저장**(빈 문자열 금지).
  ⚠️ **Zoom URL은 여기서 막지 않는다** — 초안을 먼저 쓰고 나중에 등록할 수 있어야 한다. 검사는 `requestPrepReview`(와 admin 승인)로 옮겼다.
  ⚠️ **PostgREST에 트랜잭션이 없다** — `prep_sessions` insert가 실패하면 회차 없는 고아 강좌가 남으므로 **보상 삭제**를 한다.
- **`updatePrepCourse(id, input)` → `{ok, reReview}`** — 현재 값을 통째로 읽어 `allowEmptyTopics`(작성중·거절만)·`allowPastDates`(승인+시작 후)를 분기하고, **`승인` + `materialChanged`일 때만** 같은 UPDATE에서 `status:'신청'`+`submitted_at`+`admin_note:null`로 되돌린 뒤 관리자 재알림. 비교는 **실제 저장될 값**(`nextStartMin`/`nextDurationMin`/`nextDates` — 시작 후 강좌는 기존 값으로 되돌려지므로 '바뀐 것'이 아니다)과 한다. `.eq("status", 현재상태)` 낙관적 가드로 관리자 처리와 경합하면 "심사 상태가 바뀌었습니다".
- **`requestPrepReview(id)`** — `작성중`/`거절` → `신청`. **클라 입력이 아니라 저장된 행을 검증**한다(폼 우회로 미완성 강좌가 심사에 오르지 않도록): 회차 20개 → 주제 20개 전부 → **첫 회차가 미래** → **Zoom URL** → `.in("status", PREP_REQUESTABLE_STATUSES)` 가드 UPDATE → 관리자 메일. 메일이 딸려 있어 `rateLimit(\`prep-review:${userId}\`, 10, 10분)`.
- **`deletePrepCourse(id)`** — 상태 무관 삭제(회차 cascade).
- `notifyAdminsOfPrepReview(admin, courseId, isResubmit)` — 강좌·회차·프렌더 이메일을 다시 읽어 `sendPrepCourseReviewRequestNotification`에 넘기는 best-effort 헬퍼.
  ⚠️ `price_krw`는 **입력을 받고 서버가 범위(`PREP_MIN/MAX_PRICE_KRW`)를 재검증**한다(한때 "관리자 고정가"라 무시했었다 — 위 정책 항목 참고).

**admin 액션**(`src/app/admin/actions.ts`, `requireAdmin()` 선행 + `revalidatePrepConsumers()`): **`approvePrepCourse(id)`**(승인 직전 **첫 회차 미래·프렌더 Zoom URL 재확인** → `.eq("status","신청")` 가드 UPDATE → 승인 SMS)·**`rejectPrepCourse(id, note)`**(사유 필수, 같은 가드 → `admin_note` 저장 → 거절 SMS, **사유 120자 절단·강좌명 30자 절단**). 프렌더 승인과 달리 **RPC를 쓰지 않는다** — 단일 행 UPDATE라 조건부 update로 충분(프렌더 쪽은 `profiles`+`app_metadata`를 함께 바꿔야 해서 RPC였다).

## 날짜 로직 `src/lib/prep.ts`

`buildWeekdaySessions(startDate, count)`(시작일부터 평일만 N개, 시작일이 주말이면 다음 평일부터) · `addDays` · `weekdayOf` · `isWeekday`. **순수 함수**라 폼과 서버 검증이 같이 쓴다.
⚠️ **TZ 비종속**: `Date.UTC` 산술만 쓴다(로컬 타임존이 끼면 KST 날짜가 하루 밀린다 — `addDaysKst`와 같은 이유).
**표시 헬퍼도 여기**(폼·목록·모달이 같은 라벨을 쓰도록): `kstToday()`(Intl `en-CA`+timeZone — ⚠️ `booking.ts`의 `todayKst`는 `server-only`라 클라에서 못 쓴다) · `fmtDateKo`("9월 1일") · `fmtDateShort`("9/01(월)", 요일은 `weekdayOf`라 TZ 안전) · `formatWon` · **`toLocalDate`**(YYYY-MM-DD → **로컬 자정 Date**, 이 파일에서 유일하게 TZ에 얽힌 함수 — react-day-picker에 넘길 날짜는 전부 이걸 쓴다. 개설 폼·admin 심사 캘린더 공용).

## UI

- 탭 **「프렙 강좌」 `/friender/prep`** — `FrienderTabs`의 `plusOnly` 플래그로 Plus에게만 노출(레이아웃이 `isPlus`를 내려준다). ⚠️ **탭 숨김만으로는 부족** — page에서도 Plus 가드로 URL 직접 접근을 막는다.
- **`PrepManager`**(client): 페이지 껍데기 — 안내문·Zoom 배너 + 인라인 **개설 폼** + **내 강좌 목록**(행에 **상태 배지**·거절 사유·**「승인 요청」 버튼**(`작성중`/`거절`만, `reviewBlockerOf`가 Zoom·20/20·첫 회차를 미리 검사해 비활성+사유 문구) + 확인 `AlertDialog`)(회차·주제는 네이티브 `<details>` 아코디언 — `StudentEnrollments` 선례) + 삭제 `AlertDialog` + 수정 모달. 서버 액션 호출·`useTransition`(`pending`)·toast·`router.refresh()`를 **여기서만** 한다(폼은 값만 올려보낸다).
- **`PrepCourseForm`**(client, 개설·수정 **공용**): 강좌명·시작 시각(시/분, **기본값 없음**)·진행 시간·난이도·정원·수강료·소개·시작일 + **회차별 주제 20칸**(+ 여러 줄 **일괄 붙여넣기** 상자 → 앞에서부터 채움, `N/20` 카운터) + **회차 캘린더**(`ui/calendar`=react-day-picker `mode="multiple"`, 자동 채운 20일 표시·클릭 토글·`20/20` 카운터, 20회가 아니면 저장 버튼 비활성) + 확인 `AlertDialog`(요약 dl). 타입 `PrepCourse`(page가 import)·`PrepFormValues`(=`PrepCourseInput` 모양)의 정의처이고, `PrepManager`가 `PrepCourse`를 re-export한다.
  **폼이 자기 상태를 소유한다** → 초기값은 `initial`(없으면 빈 폼)에서 만들고, 개설 성공 후 비우기는 `PrepManager`가 `key`를 증가시켜 **재마운트**로 처리(부모가 폼 내부 상태를 건드리지 않는다). `onDirtyChange`는 **초기 스냅샷(JSON) 비교**라 "고쳤다 되돌린" 경우는 dirty가 아니다.
  **상태별 폼 동작**(`initial.status`로 분기): 저장 버튼 문구는 `작성중`/신규=「임시저장」, 그 외=「수정 저장」. **주제 완결 요구는 `신청`/`승인`일 때만**(`topicsRequired`)이고 카운터 색도 초안에서는 빨강으로 경고하지 않는다. `거절`이면 상단에 **사유 배너**, `승인`이면 상단 배너가 **자유 수정 범위(소개·주제)를 먼저 알려 주고**, 심사 대상 항목을 실제로 건드린 순간(`willRevoke`)에만 빨간 경고 + 확인 다이얼로그 문구가 "승인이 해제됩니다"로 바뀐다. 승인 요청 버튼은 폼이 아니라 **목록 행**에 있다(개설 모드에는 아직 id가 없고, 저장→요청 2단계가 반쯤 실패할 여지를 없애려고).
  ⚠️ **Calendar는 로컬 타임존 Date를 준다** — `toISOString()`으로 키를 만들면 KST에서 하루 밀린다. 로컬 연·월·일을 직접 조립(`toKey`)하고 반대 방향도 로컬 자정 Date(`toDate`)로 만든다.
  ⚠️ `AlertDialogDescription`은 `<p>`라 dl은 **바깥 형제**로, base-nova `AlertDialogAction`은 자동으로 안 닫히므로 핸들러에서 `setConfirmOpen(false)`.

## 수정·삭제

- **시작 전 강좌**(첫 회차가 미래): 개설 폼 그대로 **전부 수정**(일정·주제 포함).
- **시작 후 강좌**(=**`승인`** + 첫 회차가 오늘 이전): **심사받은 조건 전체가 고정**(일정·시각·진행 시간·수강료·정원·난이도·강좌명) — **`강좌 소개`와 `회차 주제`만 수정 가능**.
  규칙 한 줄: **이미 시작한 강좌는 승인받은 조건 그대로 끝까지 간다.** ⚠️ 한때 시작 후에도 수강료·정원·난이도·강좌명을 고칠 수 있었는데, 그것들이 심사 대상이라 **진행 중인 강좌가 「심사 중」으로 내려가는** 이상한 상태가 됐다(결제가 붙으면 '진행 중 수강료 변경'이라는 더 큰 문제) → 잠그는 쪽으로 정리. 커리큘럼(주제)은 진행하며 다듬을 수 있어야 해서 남겼다.
  ⚠️ 초안·심사 중 강좌는 첫 회차가 지났어도 **잠그지 않는다**(위 상태 기계 항목).
  ⚠️ 폼 잠금은 UX 레이어일 뿐 — **서버가 authoritative**: `updatePrepCourse`가 `started`를 다시 판정하고, 우회 제출이 와도 **`next*` 변수로 기존 값을 되돌린다**(그 결과 `materialChanged`도 항상 false라 진행 중 강좌는 승인이 풀리지 않는다). 검증도 `validatePrepInput(input, { allowPastDates: started })`로 분기(시작 후에는 '내일 이후' 규칙을 건너뛴다 — 지난 회차가 그대로 들어오기 때문).
- **회차 교체는 `replace_prep_sessions` RPC**(`20260822183052`)로 한 트랜잭션에서 delete+insert.
  ⚠️ 순차 update가 아닌 이유 = `unique(course_id, session_date)` 때문에 **1강↔2강 날짜 맞바꾸기**가 중간 상태에서 충돌한다. delete→insert를 앱에서 하면 PostgREST에 트랜잭션이 없어 실패 시 **회차 0개 강좌**가 남는다.
  ⚠️ RPC가 `auth.uid()`로 소유권을 검증하므로 **세션 client로 호출**해야 한다(service_role로 부르면 항상 거부 — `join_friender_room`과 같은 함정).
- **삭제는 신청자가 없을 때만**(회차는 FK cascade) — 프렌더·관리자 양쪽에 `countPrepEnrollments` 가드가 있다(위 수강신청 절).
- UI는 **수정 모달 `PrepEditModal`**: 목록 행의 「수정」 → 모달에 `PrepCourseForm mode="edit"`를 그대로 싣는다(목록 안에 20개 주제+캘린더를 펼치거나 페이지 상단 개설 폼을 수정 모드로 바꾸면 스크롤이 길어져 지금 뭘 고치는지 놓친다 — 후자를 쓰다 모달로 옮겼다). 강좌마다 초기값이 달라 `key={course.id}`로 재마운트, `course === null`이면 언마운트(`RoomInfoModal` 방식).
  ⚠️ **z-index/닫기 규약**(`AvailabilityModal` 이식): 오버레이 `z-[110]`·패널 `z-[120]`·**모달 안의 `AlertDialog`는 `z-[130]`**(폼의 확인 다이얼로그는 `confirmClassName`으로 주입). Esc·오버레이 클릭은 `[role="alertdialog"]`가 떠 있으면 무시(이중 닫힘 방지), **dirty면 닫기 가드 `AlertDialog`**, `pending` 중에는 닫히지 않는다. body scroll lock + 닫기 버튼 포커스.
  ⚠️ 시작 후 강좌는 폼에서 **심사 대상 입력 전체를 잠근다**(`started` prop — 예전 이름 `scheduleLocked`) — 서버가 어차피 기존 값으로 되돌리는데 입력만 열려 있으면 "바꿨는데 반영 안 된다"로 보인다.

## 수강신청 (`20260824001559_add_prep_enrollments.sql`)

**신청 접수 + 무통장 입금 안내**까지가 이번 범위다 — 카드결제·자동 환불은 없다. 관리자가 입금을 확인하면 확정.
상태: **`입금대기` → `수강확정`**, 그리고 `취소`. ⚠️ `prep_courses.status`의 `신청`은 **개설 심사** 상태라 수강신청 쪽에서는 그 단어를 쓰지 않는다.

- **`prep_enrollments`** — `id` PK + **부분 unique `(course_id, user_id) where status <> '취소'`**. ⚠️ 복합 PK를 쓰지 않은 이유: 돈이 걸려 **취소 이력을 남겨야** 하는데(입금 확인 기록이 환불 근거), 복합 PK에 `취소` 행이 남으면 **재신청이 영영 막힌다**(`enrollments`와 같은 선택, `friender_room_participants`의 delete 방식과 반대).
  컬럼: 학생 스냅샷(`student_name`·`student_phone`) + **강좌 표시 스냅샷**(`course_title`·`start_min`·`duration_min`·`session_count`·`first_session_date`·`last_session_date`·`price_krw`) + `status`·`admin_note`·`paid_at`·`cancelled_at`.
  ⚠️ **강좌 스냅샷이 필수인 이유**: 프렌더가 승인된 강좌를 고치면 `승인`이 풀려 공개 정책(`status='승인'`)에서 빠지고, 임베드 조회를 쓰면 **학생 마이페이지가 빈칸**이 된다.
  RLS는 **본인 select만**. 쓰기 정책 없음 → 신청=RPC, 취소·입금확인=서버 액션(service_role).
- **공개 조회 정책 신설**: `prep_courses_select_public`·`prep_sessions_select_public`(둘 다 `status='승인'`). ⚠️ permissive OR이라 이 정책이 생긴 뒤로 **소유자 화면은 반드시 쿼리에서 `.eq("friender_id", …)`** 를 걸어야 한다(이미 적용).
### 접수 시간창 (`20260826215339_prep_apply_time_window.sql`)

**신청은 KST 07:00~19:00에만 받는다**(19:00 ~ 익일 07:00 마감). 접수 즉시 신청자 입금 안내 SMS + 관리자 메일 + 프렌더 SMS가 나가므로, 심야 접수는 곧 심야 문자 발송이고 입금 대조·응대가 불가능한 시간에 결제 동선이 열리는 것과 같다.

- 경계는 **반개구간** — 07:00 정각 개시, 19:00 정각 마감. 앱은 `m >= PREP_APPLY_OPEN_MIN && m < PREP_APPLY_CLOSE_MIN`, SQL은 `hour not between 7 and 18`로 같은 결론을 낸다.
- **authoritative는 RPC**의 검사다(`already` 뒤 · `phone_unverified` 앞 → 코드 **`closed`**). ⚠️ `join_prep_course`는 `authenticated`에 grant돼 브라우저가 직접 부를 수 있어 서버 액션 선검사만으로는 우회된다 → **상수가 SQL·앱 두 곳에 있다**(`NO_SHOW_GRACE_MIN`과 같은 사정, 바꿀 땐 함께). 검사 위치 근거: 이미 신청한 사람에게 `closed`는 혼란이고(→ `already` 뒤), 프로필을 고치고 와도 어차피 막히므로 프로필 안내를 먼저 띄우면 헛걸음이다(→ `phone_unverified` 앞).
- 상수·문구 단일 소스 = `src/data/prep.ts`(`PREP_APPLY_OPEN_MIN`·`PREP_APPLY_CLOSE_MIN`·`PREP_APPLY_WINDOW_LABEL`·`PREP_APPLY_CLOSED_MSG`), 판정 = `src/lib/prep.ts`의 `isPrepApplyOpen()`/`kstMinuteOfDay()`(TZ 비종속 산술, `classtime.ts`가 `KST_OFFSET_MS`를 export). 액션 `applyPrepCourse`는 **`rateLimit` 앞**에서 선검사한다(알림이 나가지 않는 요청에 예산을 쓰지 않는다).
- **UI는 배너를 숨기지 않는다** — 강좌 정보는 그대로 두고 상단에 "지금은 수강신청 시간이 아니에요 · 매일 오전 7시~오후 7시" 안내 + 「신청하기」·모달 신청 버튼 비활성. ⚠️ 숨기면 "강좌가 사라졌다"로 읽힌다. 열림 여부는 **서버가 `applyOpenInitial` prop으로 내려주고**(hydration mismatch 방지) 배너가 **1분 틱**으로 갱신한다(모달을 연 채 19:00을 넘겨도 자동으로 잠긴다).
- ⚠️ **취소(`cancelPrepEnrollment`)는 시간 제한 없음** — 입금 전 취소는 사용자에게 불리하지 않은 동작이라 시간으로 막을 이유가 없다. 개설·심사·회차 입장도 무관.

### 중도 수강신청 (`20260826003601_prep_midjoin_enrollment.sql`)

**강좌가 시작된 뒤에도 남은 회차만큼 신청을 받는다.** 예전에는 첫 회차가 지나면 목록에서 통째로 빠지고 RPC가 `started`로 거절했다 — 20회 과정이라 후반에 들어오려는 수요를 받을 방법이 아예 없었다.

- **잔여 판정 = 회차 종료 시각**(`session_date + start_min + duration_min` 분 > KST 현재). ⚠️ **날짜 비교(`session_date >= 오늘`)가 아니다** — 06:00~06:40 강좌를 23시에 신청하면 오늘 회차는 못 듣는데 날짜로 세면 그 회차까지 청구된다. 입장 시간창(`canEnterClass`: 시작 15분 전~**종료**)과 같은 경계라 **"청구된 회차 = 입장 가능한 회차"**가 성립한다.
- **마감은 `ended`**(잔여 0) — `started`를 대체. 마지막 회차가 끝나야 마감이다(잔여 1회짜리도 신청 가능).
- **요금은 잔여 비례**: 단가 = `floor(수강료 / 전체 회차)`, 청구액 = `단가 × 잔여`. ⚠️ **잔여 = 전체이면 정가 원값**(시작 전 신청자가 절사 누적으로 정가보다 싸지면 안 된다). 절사인 이유는 반올림하면 1회분이 정가 비율보다 비싸지기 때문. **같은 공식이 두 곳에 있다** — RPC(authoritative)와 `src/lib/prep.ts`의 `prepUnitKrw`/`prepChargeKrw`(배너 표시용). 한쪽만 고치면 "보여준 금액 ≠ 청구액"이다.
- ⚠️ **스냅샷의 의미가 "강좌"에서 "내가 산 것"으로 바뀌었다**: `first_session_date`=**내 첫 수강 회차**, `session_count`=**내가 결제한 잔여 회차 수**, `price_krw`=**잔여 비례 청구액**(`last_session_date`만 강좌 마지막 회차 그대로). 시작 전 신청자는 잔여=전체라 값이 종전과 같아 **기존 행 백필이 필요 없었고**, 마이페이지 기간·회차·금액, admin 신청자 금액, 확정 SMS의 "첫 수업"이 **읽는 쪽 수정 없이 자동 정합**된다. 신규 컬럼을 두지 않은 이유이기도 하다.
- **`first_session_date`가 회차 컷오프 키**다(아래 「회차 입장·출결」). ⚠️ 회차 `id`를 키로 쓰면 안 된다 — `replace_prep_sessions`가 delete+insert라 id가 바뀐다. 날짜는 신청자가 생기는 순간 프렌더 수정 금지 가드로 얼어붙는다.
- ⚠️ **알림은 강좌 원본이 아니라 스냅샷에서 읽는다**(`notifyPrepEnrollment`) — 원본 `price_krw`를 쓰면 관리자 메일·프렌더 SMS에 정가가 찍히는데 학생은 잔여분만 입금해 **입금 대조가 그 자리에서 깨진다**.
- ⏳ **입금 확인이 늦어져 그 사이 회차가 지나가는 경우는 재계산하지 않는다** — 금액은 신청 시점 고정이고(이미 입금한 금액과 어긋난다) 운영(관리자 취소·재신청)으로 흡수한다.
- **개설·심사는 여전히 "시작 전"만 허용**한다(`validatePrepInput`·`requestPrepReview`·`approvePrepCourse`). 진행 중 강좌의 프렌더 수정 잠금(위 「수정·삭제」)도 그대로다 — 이번에 푼 것은 **신청 잠금뿐**이다.

- **RPC `join_prep_course(p_course_id)`** — ⚠️ **인자가 강좌 id 하나뿐**인 것이 핵심이다. `authenticated`에 grant돼 브라우저가 직접 부를 수 있어, 이름·전화·가격을 인자로 받으면 ① 서버 액션의 전화 인증 게이트가 우회되고 ② 임의 번호가 스냅샷에 심어져 **확정 SMS가 남에게 간다**. 이름·전화는 함수가 `profiles`에서, 가격·일정은 잠근 강좌 행에서 직접 읽는다. 검사 순서: `unauthenticated` → `for update` 잠금 → `not_found`/`not_approved`/`own_course`/`already` → **`closed`**(접수 시간창 — 위 절) → `phone_unverified` → **`profile_incomplete`**(성·이름·영어 이름 필수 — `20260824015631`, 신청 명단이 "(이름 없음)"으로 남으면 입금 대조·수업 운영이 안 된다) → `started`(첫 회차 ≤ 오늘 KST) → **`ended`(잔여 회차 0 — 예전 `started`)** → `full`(정원 대비 `status <> '취소'` 수) → insert(잔여 기준 스냅샷).
  ⚠️ 연습방의 노쇼 유예(`seatHeld`)는 **적용하지 않는다** — 20회차 과정이라 자리를 잡는 건 입장이 아니라 돈이다.
- **액션** `src/app/prep/enroll-actions.ts`: `applyPrepCourse`(로그인 → `rateLimit('prep-apply:…', 10/10분)` → **세션 client로 RPC** → **신청자 SMS(무통장 입금 안내 — 계좌·예금주·금액, `PAYMENT_BANK`)** + 관리자 메일 + 프렌더 SMS, 모두 best-effort. ⚠️ 신청자 SMS를 **가장 먼저** 보낸다(뒤의 조회가 실패해도 입금 안내는 나가야 한다). 금액은 스냅샷이라 중도 신청이면 잔여 비례액이다) · `cancelPrepEnrollment`(`입금대기`만, **삭제가 아니라 `취소` 상태 변경** → **신청과 대칭으로 관리자 메일(`sendPrepCancellationNotification`) + 프렌더 SMS**. ⚠️ 알림 값은 **UPDATE의 `.select()`가 돌려준 취소된 행**에서 만든다 — 다시 읽으면 이미 `취소`라 `.neq("status","취소")` 조회에 안 걸린다. 안 보내면 관리자는 **오지 않을 입금을 기다리고** 프렌더는 자리가 빈 걸 모른다).
  admin(`src/app/admin/actions.ts`): `confirmPrepPayment(enrollmentId)`(`입금대기` CAS → `수강확정`+`paid_at` → 학생 SMS) · `cancelPrepEnrollmentAsAdmin(enrollmentId, note?)`(미입금 자리 회수·폐강 정리, 사유 SMS).
- **가드(이제 실효)**: 신청자가 있으면 **프렌더·관리자 모두 강좌 삭제 금지**(cascade로 입금 기록까지 사라진다), **프렌더는 심사 대상 항목 수정도 금지**(승인이 풀려 목록에서 사라지고 이미 입금하려던 사람의 조건이 바뀐다), **정원을 신청자 수보다 작게 축소 금지**. 소개·회차 주제는 계속 수정 가능.
- **상태 배지 문구·색은 `src/data/enrollment-status.ts` 공용**(`입금대기`→「결제 대기」·`수강확정`→「수강 확정」, 정규 과정과 같은 어휘·같은 색 — 「수강신청 내역」 한 탭에 두 섹션이 나란히 있어서다. 상세=`docs/enroll.md`). **UI**: `/friending` 상단 **`<PrepEnrollBanner>`** — **새벽 하늘 다크 배너**(`PrepHeroArt variant="banner"`를 `-z-10`으로 깔고 왼쪽이 진한 그라디언트 오버레이. ⚠️ 흰 카드였을 때 바로 위 프렌딩 히어로에 눌려 안 보였다. ⚠️ 어두운 판에서 남색 `bg-cta`는 묻히므로 **CTA는 흰 알약 + `text-ink`**). 강좌마다 **세부 정보(기간·시간·진행 방식·강사·수강료·신청 현황)를 반투명 카드에 펼쳐** 두고 카드별 「신청하기」가 그 강좌를 선택한 채 모달을 연다(모달 = 계좌 안내 + 최종 확인: `PAYMENT_BANK`·확인 `AlertDialog`, 비로그인은 `/login?next=/friending`, 프로필 미완(휴대폰 인증·성·이름·영어 이름)은 **빠진 항목을 나열해** 마이페이지로 안내(`profileMissing`)). ⚠️ 정원 상한(1000)은 사실상 무제한이라 `N/1000` 대신 "N명 신청"으로 표기(`seatLabel`) · **`/mypage/enrollments`(「수강신청 내역」 탭의 「프렙 강좌」 섹션)**(스냅샷 기반 내역·계좌 안내·취소) · **`/admin/prep`**(개설된 강좌 테이블의 「신청자」 컬럼 + `PrepCourseInfoModal`의 신청자 목록·입금 확인·신청 취소 — ⚠️ 액션은 `PrepCoursesManager`가 소유하고 모달은 표시+콜백만).
- ⏳ **매출 미연동**: `payments`가 `enrollment_id` FK라 프렙 입금은 `/admin/revenue`에 잡히지 않는다(의도적 범위 밖).

## 회차 입장·출결 (`20260824231642_prep_attendance.sql`)

**수강확정이 돼도 수업할 공간이 없던 구멍**을 채운 절(`/mypage/enrollments`이 스냅샷 카드만 보여 주고 끝이었고, 프렌더 쪽도 대칭으로 비어 있어 **강사가 수업을 열 수단조차 없었다**). `prep_sessions`를 JSON이 아니라 행으로 둔 이유("회차별 입장·출결·연기가 붙을 자리")가 여기서 실현된다.

- **데이터**: **`prep_attendance(session_id, user_id, entered_at)`** PK 복합 + `prep_attendance_user_idx(user_id)`, RLS **`_select_own`만**(프렌더·admin은 service_role로 집계 — `friender_room_participants`와 같은 정책). `prep_sessions`에 **`host_entered_at`**(호스트 첫 입장, `classes.teacher_entered_at` 선례). ⚠️ `classes`처럼 회차 행에 수강생을 비정규화하지 않는다 — 프렙은 수강신청이 강좌 단위라 회차마다 학생 행을 미리 만들면 20×N개가 생긴다.
- **⚠️ 시간창은 `enterRoom` 계열**(`canEnterClass` 시작 15분 전~종료). **`lessonEndMin`(정규 수업 전용 30→25분 축소)을 쓰지 않는다** — 프렙은 `end_min`이 아니라 `duration_min` 모델이다. 종료는 반드시 `kstDateMinToMs(session_date, start_min + duration_min)`(자정 넘김 대응), 표시는 `fmtRoomEnd`로 `(익일)`.
- **액션 `enterPrepSession(sessionId)`**(`src/app/prep/session-actions.ts`) 가드 순서: 입력 → 로그인 → service_role로 회차+강좌 조회 → **자격**(개설 프렌더 ∥ `수강확정` 수강생 — ⚠️ **`입금대기`는 거부**, 프렙에서 자리를 잡는 건 입장이 아니라 돈이다) → **시간창**(서버 authoritative) → **첫 입장 sticky 기록**(호스트=`host_entered_at`을 `.is(null)` 조건 update, 학생=`prep_attendance` upsert `ignoreDuplicates`) → `profiles.zoom_url`(개설 프렌더 최신값) + `isValidZoomUrl`. ⚠️ **revalidate 하지 않는다**(새 탭을 여는 동작 — `enterRoom`과 동일).
- **⚠️ 중도 신청 컷오프**: 학생에게는 **신청 스냅샷 `first_session_date` 이후 회차만** 보인다(`isMySession(from, date)` — `src/lib/prep-session.ts`). 안 자르면 결제하지 않은 지난 회차가 「지난 수업」에 **"미입장"으로 남는다**. `loadPrepSessionsForStudent`·`loadTodayPrepSessions`가 적용하고(프렌더 로더는 자기 강좌라 미적용), **서버 authoritative는 `enterPrepSession`의 컷오프 검사**다. ⚠️ 그래서 `PrepCourseSessions.sessions`는 "강좌 전체"가 아니라 **내 회차**다 — 회차 번호의 분모(`{sessionNo}/{total}회차`)는 반드시 **`totalSessions`**(강좌 전체)를 쓸 것(`sessions.length`를 쓰면 "7/14회차"가 된다).
- **⚠️ 조회는 전부 service_role**(`src/lib/prep-session.ts`): `prep_sessions`의 SELECT 정책은 `_select_own`(개설자)·`_select_public`(`course.status='승인'`)뿐이라 **프렌더가 승인된 강좌를 고쳐 승인이 풀리는 순간 수강생 화면에서 회차가 통째로 사라진다**. RLS 정책을 늘리는 대신 서버에서 `prep_enrollments`로 자격을 직접 확인한다(`/mypage/enrollments`이 임베드 대신 스냅샷을 쓰는 것과 같은 방어). 헬퍼 3종: `loadPrepSessionsForStudent(userId)`·`loadPrepSessionsForFriender(userId, courseIds)`(출석 **수만**, 신원 비공개)·`loadTodayPrepSessions(userId, todayKst)`. `classroom.ts`처럼 **`startMs`/`endMs`를 서버에서 미리 계산**해 클라는 숫자만 비교한다.
- **UI 공용 `<PrepSessionList>`**(`src/components/prep/`, client — 수강생·프렌더가 **한 컴포넌트**를 쓰고 `isHost`로만 갈린다): 1분 틱 + **`ViewToggle`(목록/달력, 기본 목록)** + 목록 2분할(`예정된 수업`/`지난 수업`, `endMs >= now` 기준·지난 것은 `.reverse()` — `ClassroomList`의 `SessionList`와 같은 규칙) + 행 액션 상태 머신(입장창 → `입장` / 미래 → `시작 15분 전 입장` / 지난 → 학생 `출석`·`미입장` 칩, 프렌더 `출석 N명` 칩). **달력**은 `mode="single"` + `modifiers.session`으로 수업일을 칠하고 날짜 클릭 시 그 날 회차를 아래에 편다. ⚠️ **Calendar는 로컬 TZ Date를 준다** — 키는 로컬 연·월·일 조립(`toISOString()`은 KST에서 하루 밀림, `PrepCourseForm`의 `toKey`와 같은 함정).
- **입장 버튼**: **팝업 차단 회피(빈 탭 먼저 열고 URL 주입) 로직의 소유자를 `<EnterZoomButton>`(`src/components/`)으로 분리**했고 **`EnterRoomButton`은 얇은 래퍼**가 됐다(연습방 호출부 4곳 무변경). 안내 다이얼로그(`withGuide`)는 **수강생만** — 호스트는 자기 수업이라 바로 연결(연습방과 같은 규칙).
- **소비처**: 학생 **`/mypage/classroom`(「내 강의실」)** — ⚠️ 한때 `/mypage/enrollments`에 넣었다가 옮겼다: 정규 과정이 「수강신청 내역」(결제)과 「내 강의실」(수업)로 갈려 있는데 프렙만 한 탭이 둘을 겸해, **"수업 들어가려면 어디로 가지"의 답이 과정 종류마다 달랐다**. 입장 동선은 종류와 무관하게 한 곳이어야 한다. **정규 과정과 같은 2단계**(카드 → 상세, 상세 기본 뷰도 달력으로 통일)이고 `ClassroomList`가 선택 prop `prepCourses`로 받아 **카드·상세·섹션 제목을 모두 소유**한다(형제 합성은 정규 상세 아래 프렙 카드가 남아 폐기 — 상세는 `docs/classroom.md`). 제목은 둘 다 있을 때만 붙어 프렙이 없으면 기존 화면 그대로다. 신청·입금 기록은 **「수강신청 내역」 탭**이 두 과정을 함께 담고(⚠️ **「프렙 수강」 탭은 폐지** — 회차 입장이 「내 강의실」로 옮겨간 뒤 남은 게 신청·입금 기록뿐이라 「수강신청 내역」과 같은 일을 하는 탭이 둘이었다. `/mypage/enrollments`은 북마크 보호용 **리다이렉트만** 남김) `수강확정` 행에 「내 강의실」 링크를 둔다(옮긴 사실이 화면에 없으면 "입장 버튼이 사라졌다"로 읽힌다) · 프렌더 `/friender/prep`(**`승인` 강좌만**, 달력 기본 — 승인돼야 수업을 연다. 승인 강좌는 기존 `<details>` 커리큘럼을 이 목록이 대체하고, 초안·심사·거절에만 `<details>`가 남는다. Zoom 미등록이면 버튼 비활성 + 기존 경고 배너) · **마이페이지 상단 `<TodayPrepBanner>`**(`src/app/mypage/layout.tsx`가 렌더 → 어느 탭에 있든 보인다. ⚠️ 오늘 회차가 없으면 **아예 렌더하지 않는다** — 빈 자리를 남기지 않기 위해).
- **오늘 수업 안내는 화면만** — 마이페이지 상단 `<TodayPrepBanner>`가 조회 시점 계산으로 담당한다. ⚠️ **메일 알림은 만들었다가 걷어냈다**: 이 저장소에 없던 **크론 인프라(`vercel.json` crons + `/api/cron/*` + `CRON_SECRET`)를 알림 하나 때문에 들여야 했고**, 크론은 프로덕션 첫 실행이 곧 첫 테스트라 쿼리 체인이 어긋나면 멱등 키(`reminder_sent_at`)만 찍히고 **그날 회차의 안내가 영구 유실**되는 형태였다(재시도 없음). 컬럼은 `20260824233938`에서 제거. 되살린다면 ①발송 성공 시에만 멱등 키 기록 ②`NEXT_PUBLIC_SITE_URL` 필수(크론 요청엔 `origin` 헤더가 없어 `getOrigin`이 최후 폴백까지 내려간다) ③Vercel Hobby는 크론이 하루 1회·시각 부정확 — 세 가지를 함께 처리할 것.
- ⏳ 미구현: 회차 연기·취소, 출결 열람 화면(admin), 지각 판정(연습방의 `seatHeld` 같은 유예 규칙 없음 — 정원을 잡는 건 돈이라 자리 반환 개념이 없다).

## 공개 소개 페이지 `/prep`

예비 수강생용 **정적 홍보 페이지**(`src/app/prep/page.tsx`). ⚠️ **DB를 읽지 않는다** — 실제 강좌 카드·신청은 `/friending` 상단 배너가 담당하고 이 페이지의 CTA 2개가 그쪽으로 보낸다(`PREP_PAGE.hero.ctaHref`).

- 문구는 **`src/data/prep-page.ts`(`PREP_PAGE`)** 한 곳에 모았다(비개발자가 카피만 고칠 수 있게 — `landing.ts` 선례). ⚠️ 값 출처 구분: **회차 수는 `PREP_SESSION_COUNT`**(정책 고정), **수강료 20,000원·06:00~06:40은 이 강좌의 값**이라 리터럴(개설 폼 기본값 `PREP_DEFAULT_PRICE_KRW`와 우연히 같을 뿐 의미가 다르다). 금액은 `formatWon`.
- 구성: 히어로(스펙 칩 4개 + **비활성 CTA**) → 이런 분께 3장 → 진행 방식 다크 박스 01~04 → **커리큘럼 예시 20강**(⚠️ 실제 주제는 프렌더가 정하므로 "예시" 배지 필수) → 강사·수강료 2열 → FAQ(`<details>`) → 마무리 CTA 밴드(`#E05A6A`, 과정 상세와 같은 색) + `/friending` 텍스트 링크.
- **히어로 그림은 인라인 SVG `src/components/prep/PrepHeroArt.tsx`**(새벽 하늘·해·Zoom 타일·6:00 시계). ⚠️ 파일 `.svg`를 `next/image`로 쓰려면 `images.dangerouslyAllowSVG`를 켜야 해서 장식 하나 때문에 그 스위치를 켜지 않았다(`/friending` 히어로의 인라인 장식 SVG와 같은 선택). 색은 토큰과 같은 hex 리터럴(SVG gradient에 CSS 변수는 불안정).
- ⚠️ **`CoursePriceLine`을 쓰지 않는다** — 그 컴포넌트는 전역 21만원 상수 전용이고 프렙은 강좌마다 가격이 다르다.
- 진입은 **Navbar 링크만**(데스크톱 인라인 + 모바일 flat) — 랜딩 과정 카드에는 넣지 않았다(카드가 `CoursePriceLine`으로 21만원을 그린다).
- 수강신청이 열리면서 비활성 버튼 두 개는 **`/friending` 링크로 교체**됐다(히어로·마무리 밴드).

## ⏳ 미구현 (다음 단계)

**카드결제·환불**(지금은 무통장 + 관리자 입금 확인만)·**프렙 매출 집계**(`payments`가 `enrollment_id` FK라 미연동)·**관리자 「승인 해제」**(한 번 만들었다가 걷어냈다 — 지금은 승인 상태가 배지 말고 하는 일이 없고, 프렌더가 승인된 강좌를 수정하면 자동으로 `신청`으로 내려가는 경로가 이미 있어 중복이었다. 수강신청이 붙어 승인이 '판매 중'을 뜻하게 되면, **수강생이 있는 강좌를 삭제 대신 멈추는 수단**으로 그때 다시 넣는다)·연습방과의 **시간 겹침 검사**(지금은 공개·예약 동선이 없어 실제 충돌이 생기지 않는다 → 수강신청을 붙일 때 `roomsOverlap`을 확장해 함께 처리).
