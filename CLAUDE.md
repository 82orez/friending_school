# CLAUDE.md

Claude Code 작업 지침. 이 파일은 매 세션 로드되므로 **항상 압축적으로** 작성/갱신할 것(토큰 절감). 상세는 `docs/*.md`로 분리돼 필요할 때만 읽는다 — **새 내용은 이 파일이 아니라 해당 docs 파일에 적을 것**(아래 색인).

## 개요

**"청년을 세계로"** 워홀·해외진출 영어 통합 플랫폼(브랜드 "프렌딩 스쿨"). 구성: 5섹션 랜딩 + **과정 상세페이지 5종**(`/courses/[slug]`: workhol·kitchen·grammar1·grammar2·cosmetic — 회화 기초문법 1/2는 각각 독립 과정·독립 수강신청, 교재 키 basic1/basic2) + **전자책 뷰어 `/textbook/[course]`**(레지스트리 기반 교재 5종, 무료 미리보기 외 로그인) + **수강신청→마이페이지**(`/courses/[slug]/enroll` 강사 매칭형 수강신청 → `/mypage`) + **강사 지원**(`/teacher/apply`) + **강사 페이지**(`/teacher`: 프로필·사진·zoom·주간 가능시간·수강신청 승인/거절) + **프렌더**(`/friender`: 연습방·받은 후기, Plus는 **프렙 유료 강좌** 개설 — **관리자 승인 후 개설 완료**) + **admin 대시보드**(`/admin`: 수강신청·화상수업·회원·강사 관리·센터·매출/매출이익/강사 정산·유튜브). Next.js 16(App Router, Turbopack) + React 19.2 + Tailwind v4. shadcn/ui(`base-nova`/`neutral`), Supabase SSR 인증(이메일 + 카카오 OAuth), 알림 메일(Resend) + SMS(Solapi).

## 명령어

- `npm run dev` / `npm run build` / `npm start` (Next 16 기본 번들러=Turbopack, 스크립트에 `--turbopack` 플래그 없음)
- shadcn 추가: `npx shadcn@latest add <component>` (v4.7.0, `components.json` 따름)
- DB: `db:new <name>`(마이그레이션 파일 생성) · `db:push`(원격 적용, **destructive**) · `db:list`(적용 이력 비교) · `db:diff`(`--linked`) · `db:types`(→ `src/types/database.types.ts`, 첫 실행 전 `mkdir -p src/types`; 생성 파일이라 `.prettierignore` 등재=포맷 대상 아님)
- `sync:kitchen:audio`(kitchen 교재 음성 라이브→Storage 동기화, **service_role 필요 → 사용자가 직접 실행**). workhol 음성은 `node scripts/sync-workhol-audio.mjs`·버튼 주입 `scripts/add-workhol-audio-buttons.mjs`(npm script 없음).
- lint/test 스크립트 없음(테스트 프레임워크 미설치). Supabase CLI는 `devDependencies`에 있어 `npx supabase ...` 사용.

## 상세 문서 (해당 영역 작업 시 **먼저 읽을 것**)

전체 구조는 아래 문서로 분리돼 있다(이 파일에 되돌려 합치지 말 것 — 매 세션 로드라 토큰 낭비). 작업 영역에 해당하는 파일을 Read로 읽고 시작하고, 그 영역을 바꾸면 **해당 문서도 함께 갱신**한다.

- `docs/ui.md` — 루트 레이아웃·**색상 토큰**·Tailwind v4·shadcn(base-nova)·Button variant·`SectionCard`. **UI를 건드리는 모든 작업의 선행 문서.**
- `docs/landing.md` — 랜딩 5섹션(셀프디벨롭·유튜브·과정카드)·**수강료/할인 단일 소스(`src/data/pricing.ts`·`CoursePrice`)**·Navbar/Footer·공지 사항(`/notices`)·약관(`/terms`·`/privacy`·`/refund`)
- `docs/enroll.md` — 수강신청 위저드(`/courses/[slug]/enroll`)·마이페이지(`/mypage`)·무통장/PortOne 카드 결제·환불(수강료 상수 자체는 `docs/landing.md`)
- `docs/classroom.md` — 클래스 자동 생성·내 강의실(학생/강사)·입장·연기/보강·피드백·진행 인정(conducted)
- `docs/teacher.md` — 강사 지원(`/teacher/apply`)·승인 flow·강사 페이지(`/teacher` 3탭)·주간 가능시간 그리드
- `docs/friender.md` — 프렌더 지원/승인·등급(friender/friender_plus)·연습방(`/friender/rooms`)·프렌딩(`/friending`)
- `docs/prep.md` — **프렙(가칭)**: 프렌더 Plus 유료 강좌(월 20회·평일 기본·캘린더 일자 조정) + **개설 심사**(작성중→신청→승인/거절, admin 탭 `/admin/prep`). 수강신청·결제 미구현
- `docs/admin.md` — admin 대시보드 13탭(수강신청·화상수업·회원·강사/프렌더 승인·**프렙 강좌 심사**·센터·매출·매출이익·시뮬레이션·정산·유튜브·공지)
- `docs/center.md` — 센터 매니저(`/center`)·권한 가드·admin 공유 컴포넌트 이중언어(`LangProvider`)
- `docs/auth.md` — 인증 라우트 6종·카카오 OAuth·Supabase SSR client·**환경 변수 전체 목록**
- `docs/textbook.md` — 전자책 `/textbook/[course]` 레지스트리·유닛 HTML·음성 동기화
- `docs/helpers.md` — `src/lib/*` 헬퍼 인덱스(availability·payment·events·settlements·fx 등). **새 헬퍼 만들기 전 중복 확인용.**
- `docs/db.md` — 마이그레이션 이력·테이블/RLS/트리거 전체

**문서 선택 요령**: 결제=enroll+admin, 수업 일정 변경=classroom+admin, 새 컬럼/테이블=db, 알림 메일·SMS=helpers(mailer·sms·center-notify).

## 주의사항

- **TS 느슨함**: `strict:false`, `noImplicitAny:false` — 타입 명시 확인 권장.
- **Tailwind v4 `@apply` 제한**: `@layer components` 안에서 다른 커스텀 컴포넌트 클래스 `@apply` 시 빌드 실패 → 유틸 추출 또는 JSX className 조합.
- **shadcn + `cn()`**: 신규 UI는 `src/components/ui/` 재사용 우선, 추가는 CLI. `base-nova`/`neutral` 변경 금지. className은 항상 `cn()`(직접 결합 시 tailwind-merge 누락).
- **Server Action + `useActionState` 유지**: `fetch` 없이 `<form action>`. 성공 시 `revalidatePath`→`redirect`, 실패 시 `{error}`(/`{success}`). 인증 액션 import는 `@/app/(auth)/<route>/actions`.
- **Controlled input 필수**: Base UI `defaultValue` 경고 + React 19 auto-reset → 항상 `useState`+`value`+`onChange`, round-trip 금지.
- **인증 액션 순서**: (1) 필수값 검증 (2) `rateLimit()` (3) `isValidEmail()` (4) Supabase 호출. rate limit 키는 `email.toLowerCase()`. redirect는 `getOrigin()`.
- **사용자 열거 노출은 의도된 정책**: login/signup/forgot 모두 가입/미가입 구분 — 변경 시 세 곳 함께.
- **⚠️ 미확인 사용자 비번 덮어쓰기 방지(절대 우회 금지)**: signup은 `signUp()` 전 `getUserIdentitySummary()`로 확인, `found&&!confirmed` 차단. `!summary.found`일 때만 `signUp()` 호출 순서 유지.
- **Prettier**: `printWidth:150`, `endOfLine:"lf"`, `singleQuote:false`, `trailingComma:"all"`, `semi:true`, `tabWidth:2`, `prettier-plugin-tailwindcss`.
- **버튼 커서 금지**: 전역 규칙 있음 → `cursor-pointer` 추가 금지(`disabled:cursor-not-allowed`만 허용).
- **색상 토큰 우선**: hex arbitrary value 피하고 시맨틱 토큰 사용(토큰 목록=`docs/ui.md`).
- **CTA/anchor**: 랜딩 `#courses`, 과정 상세 `#apply-form` 등 anchor + `scroll-behavior:smooth`. `<a>` 버튼화는 `buttonVariants()`+`cn()`.
- **모바일 메뉴 a11y 회귀 주의**(`docs/landing.md`의 Navbar 항목 체인 유지).
- **DB 변경은 항상 마이그레이션**: `db:new`→검토→`db:push`. **`db:push`는 destructive** — 직후 `/signup` 회귀 테스트(가입 성공 + `profiles` row + `raw_app_meta_data.role='student'`). 파일명 수동 명명 금지.
- **⚠️ role은 `app_metadata`에만, `user_metadata` 절대 금지**(후자는 클라가 `updateUser({data})`로 수정 가능 → 권한 우회). role 읽기는 JWT `app_metadata.role` 또는 `profiles.role`만. role 부여 시 `admin.auth.admin.updateUserById(id,{app_metadata:{role}})` + `profiles` update 함께.
- **profiles RLS 최소(본인 row만)**: admin 전체 조회 정책 미구현 → 필요 시 `createAdminClient()` 우회. 향후 `profiles_admin_all` 정책 추가.
- **교재 완료 액션 가드 유지**(`docs/textbook.md`의 `src/app/textbook/actions.ts` 항목): `setUnitCompleted`은 레지스트리 화이트리스트+unit 존재 검증 후 upsert. 완료는 **사용자 수동 토글만**(스크롤 자동 판정 부활 금지).

## 별칭

`@/*` → `./src/*`. 이미지는 `next/image`만(`public/images/`). **강사 아바타는 Supabase Storage 공개 URL** → `next.config.ts` `images.remotePatterns`에 `*.supabase.co` `/storage/v1/object/public/**` 등록됨. Favicon은 `src/app/icon.svg`(파일 컨벤션).

## 배포

Vercel 배포. `vercel.json`은 `regions:["icn1"]`(서울 리전 고정)만 설정 — 한국 사용자 대상 레이턴시 최적화. 환경 변수는 `docs/auth.md`의 Supabase SSR 항목 참조.
