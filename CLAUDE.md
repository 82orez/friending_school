# CLAUDE.md

Claude Code 작업 지침. 이 파일은 매 세션 로드되므로 **항상 압축적으로** 작성/갱신할 것(토큰 절감).

## 개요

**"청년을 세계로"** 워홀·해외진출 영어 통합 플랫폼(브랜드 "프렌딩 스쿨"). 구성: 5섹션 랜딩 + **과정 상세페이지 4종**(`/courses/[slug]`: workhol·kitchen·grammar·cosmetic) + **전자책 뷰어 `/textbook/[course]`**(레지스트리 기반 교재 5종, 무료 미리보기 외 로그인) + **상담신청→마이페이지**(`/mypage`) + **admin 대시보드**(`/admin`: 신청·회원·유튜브). Next.js 16(App Router, Turbopack) + React 19.2 + Tailwind v4. shadcn/ui(`base-nova`/`neutral`), Supabase SSR 인증(이메일 + 카카오 OAuth), 신청 알림 메일(Resend).

## 명령어

- `npm run dev` / `npm run build` / `npm start` (모두 Turbopack)
- shadcn 추가: `npx shadcn@latest add <component>` (v4.7.0, `components.json` 따름)
- DB: `db:new <name>`(마이그레이션 파일 생성) · `db:push`(원격 적용, **destructive**) · `db:list`(적용 이력 비교) · `db:diff`(`--linked`) · `db:types`(→ `src/types/database.types.ts`, 첫 실행 전 `mkdir -p src/types`)
- lint/test 스크립트 없음(테스트 프레임워크 미설치). Supabase CLI는 `devDependencies`에 있어 `npx supabase ...` 사용.

## 아키텍처

**랜딩 페이지** `src/app/page.tsx`(async server). **5섹션**: ①히어로(`hero-bg.jpg` 배경 + `text-brand-gradient` "세계로") ②셀프디벨롭(`<SelfDevelop/>` client, props `isLoggedIn`+`completedByCourse` — 교재 탭 5종/진행바/더보기 아코디언. **`LINKED_COURSE`(book.key→레지스트리 course)에 등록된 교재만 전자책 연동**: 현재 **5종 전부 연동**(workhol·kitchen·grammar1·grammar2(키 basic1/basic2)·cosmetic) — mock placeholder(`UnitCard`/비연동 분기)는 현재 미사용 dead. 연동 카드=`LinkedUnitCard`(유닛 `/textbook/<course>/<n>` 링크, 잠금=`!isLoggedIn && !freeUnits`(자물쇠→`/login?next=`), 로그인 시 우상단 ○/✓ **수동 완료 토글** `setUnitCompleted` 낙관적, 완료 카드 `bg-progress/5`). **부제/소개**: `renderUnit`이 레지스트리 `getTextbook(course)` 유닛에서 `subtitle=u.sub??titleKr`·`situation`(부제와 **다를 때만** 주입=사실상 workhol·kitchen·cosmetic)을 전달 — `situation` 있으면 카드 **좌측정렬 + 소개문단**(`line-clamp-3`), 없으면 가운데정렬(grammar). 완료 상태는 `BookPanel` 로컬 state로 상단 진행바와 공유. **연동 확장 시 2곳 동기**: `SelfDevelop`의 `LINKED_COURSE` + `page.tsx`의 진행률 쿼리 `reading_progress.in("course",[...])`) ③유튜브 생존기(`youtube_videos` 노출분 SSR 조회→비면 mock `VIDEOS` fallback, `getYoutubeId`로 썸네일) ④실전 스피킹(과정카드 4종 → `/courses/<slug>`, 앵커 `#courses`) ⑤액티비티. **데이터는 `src/data/landing.ts`**(`BOOKS`·`VIDEOS`·`COURSE_CARDS`·`ACTIVITIES` — 교재 유닛·과정 커리큘럼이 모두 `BOOKS`에서 파생되는 단일 소스). `BookUnit`={`n`/`t`/`sub?`/**`situation?`**/`s`} — **`situation?`(유닛 상황 소개)은 kitchen·cosmetic 24유닛에 채워짐**(각 `content/textbook/<course>/unit-NN.html`의 `.situation`에서 추출, 카드 소개문단용); workhol은 `WORKHOL_UNITS.situation` 별도, grammar는 없음. 카피 수정 시 이 파일 먼저 편집. `searchParams` `reset`/`verified`/`signup=success` 시 `SuccessBanner`. 시맨틱 `<h1>` 1개(히어로)·섹션 `<h2>`. 반응형 모바일 기본 + `md:`. 전체를 `bg-surface` 래퍼로 감싸 흰 카드 대비.

**공통 컴포넌트** `Navbar.tsx`(client, 슬라이드 메뉴)·`Footer.tsx`(server)는 `layout.tsx`에서 children 감쌈.
- Navbar는 `user: { email? } | null` + `isAdmin` prop을 SSR로 받고(`layout.tsx`가 전달), `onAuthStateChange` 구독 + `pageshow`(bfcache) 리스너로 stale 방지. 로고는 `next/image`(`/images/logo.png`, `width=123 height=36`, `priority`).
- 슬라이드 메뉴: **커리큘럼 아코디언**(과정 4종 `/courses/<slug>`) + **교재 보기 아코디언**(`TEXTBOOKS` `src/data/textbook/index.ts`) + 인증 영역(로그인 시 **관리자**(admin만)·**마이페이지**·이메일·로그아웃 / 비로그인 시 로그인·회원가입). 두 아코디언 모두 `<button>` 토글(`curriculumOpen`/`textbookOpen` state, `aria-expanded/controls`, grid `0fr→1fr` 트릭), **메뉴 닫힐 때 둘 다 false 동기화**. 라우트는 `<Link>`+`onClick={closeMenu}`. 데스크톱 인라인에도 (관리자)·마이페이지·로그아웃/회원가입. 새 교재는 `TEXTBOOKS`에 추가만 하면 자동 반영.
- a11y: 햄버거 `aria-expanded`·`aria-controls="mobile-menu"`, 메뉴 `role="dialog"`·`aria-modal`·`aria-hidden`·`inert={!menuOpen}`, `bg-black/40` 오버레이, 열림 시 닫기버튼 포커스·닫힘 시 햄버거 복귀(`triggerRef`/`closeButtonRef`/`prevMenuOpen`), body scroll lock, Esc 닫기. **수정 시 이 체인 유지.**
- 로그아웃은 `@/app/(auth)/logout/actions`의 `logout()`을 `<form action={logout}>`로 호출.

**루트 레이아웃** `src/app/layout.tsx`(async server): `getUser()` + `isAdmin(supabase,user.id)` → `<Navbar user isAdmin>`. `<AuthHashHandler/>`(`src/components/auth/`)를 마운트해 implicit hash(`#access_token=...`) 토큰을 client에서 `setSession` 후 `/?verified=success` 또는 `/reset-password`로 replace. `lang="ko"`, Pretendard(`next/font/local`, `--font-pretendard`) + Geist(`--font-sans`). **단, `globals.css`의 `@theme inline`이 `--font-sans → --font-pretendard` 매핑이라 `font-sans`는 Pretendard.**

**스타일링** Tailwind v4: `globals.css`의 `@import` + `@theme inline`(별도 config 없음). `@custom-variant dark`. 토큰 세 그룹: (1) shadcn 색상/`--radius-*`(OKLch), (2) **마케팅 시맨틱 색**: `--color-brand`(#ff4757, 인증/강조 빨강), `--color-brand-blue`(#2563eb, **회원가입 동선 전용**), `--color-ink`(#1a1a1a), `--color-ink-soft`(#333), `--color-surface`(#f8f8f8), `--color-muted-fg`(#666), `--color-muted-fg-faint`(#999), `--color-rule`(#eee), `--color-rule-faint`(#ddd), (3) **project0607 플랫폼 팔레트(블루→핑크)**: `--color-accent-blue`(#6b8ff0)·`--color-accent-blue-soft`(#eef1fd)·`--color-accent-blue-ink`(#4a6bd4, 링크/탭 강조), `--color-cta`(#1a4fa0, **네이비 — 상담신청 CTA**), `--color-progress`(#b22222). + `@layer utilities`의 **`.bg-brand-gradient`/`.text-brand-gradient`**(블루→핑크 135deg, 히어로 "세계로"·섹션 라벨·탭 active·로고). **새 코드는 하드코딩 hex 금지, 토큰 클래스 사용**(예외 단발성: #E05A6A 신청박스, #ffc107/#F5A623 별점, #aaa 등). 다크모드 미구현. `@layer base`: 활성 버튼 `cursor:pointer` 전역 + smooth 스크롤은 `html[data-scroll-behavior="smooth"]`에만 적용(layout.tsx `<html data-scroll-behavior="smooth">`). **⚠️ CSS로 `html{scroll-behavior:smooth}` 직접 선언 금지** — 라우트 네비게이션 시 Next가 끄지 못해 페이지 이동 후 최상단 점프 실패(교재 등 상단 가림). data 속성으로 선언해야 Next가 전환 중 일시 비활성화.

**shadcn/ui** `components.json`(`base-nova`/`neutral`/lucide/RSC). UI: `src/components/ui/{button,card,input,label,textarea,alert-dialog,calendar,popover,select}.tsx`. `select.tsx`는 미사용(tracked). `calendar.tsx`/`popover.tsx`도 현재 미사용(날짜 필요 시 `date-fns`(^4) + `react-day-picker`(^10) 재사용, 한국어 `locale={ko}` 필수). `cn()`은 `src/lib/utils.ts`(clsx+tailwind-merge), 항상 사용. 아이콘 `lucide-react`, 프리미티브 `@base-ui/react`, 애니메이션 `tw-animate-css`.
- **Button variant**: shadcn 기본 + 추가 4종 — `brand`(빨강 primary), `brand-blue`(파랑, **회원가입 동선 전용**: SignupForm 제출·AlertDialogAction "보내기"), `brand-inverse`(흰, 빨강 배경 위), `kakao`(#FEE500/#191919, `KakaoButton` 전용, 고정 hex). `buttonVariants`로 `<a>`에도 적용. (상담신청 CTA는 variant 아닌 `bg-cta` 네이비 클래스.)
- ⚠️ **base-nova**: `AlertDialogAction`은 `Close`로 안 감싸져 **클릭해도 모달 자동 안 닫힘** → onClick에서 `setOpen(false)` 또는 controlled 사용. `AlertDialogCancel`은 정상.

**`SectionCard`** (`src/components/SectionCard.tsx`): 카드 div wrapper. variant 3종 — `accent-left`(`border-l-[6px] border-brand bg-surface`), `outline`(`border border-rule bg-surface`, 현재 전자책 Unit 목록에서 사용), `plain`(`bg-surface`). `rounded/p`는 호출 측 className. shadcn `Card`(슬롯)는 별개.

⚠️ **`ApplyForm.tsx`(`src/components/`)는 현재 orphan**(Phase 1 랜딩 리디자인에서 최종 CTA 섹션 제거 — 미사용 mock). 실제 신청 동선은 과정 상세페이지의 **`CourseApplyForm`** 사용(아래).

**과정 신청 + 마이페이지** (Phase 4): 과정 상세 `CourseApplyForm`(`src/components/course/`, client)이 **`useActionState` + `submitApplication`**(`src/app/courses/actions.ts`)으로 실제 저장. 액션 가드: (1)필수값 (2)`rateLimit(apply:IP, 5/10분)` (3)`isValidEmail` (4)`applications` insert. **`user_id`는 서버 `getUser()`로 주입(위조 차단), 비로그인은 null**. `option`은 select 라벨 문자열 저장. **저장 성공 후 best-effort 관리자 알림 메일**(`src/lib/mailer.ts` `sendApplicationNotification` via Resend) — `getAdminEmails()`(admin.ts, `profiles.role='admin'`→getUserById)로 수신자 조회, **try/catch로 신청 성공과 분리**(메일 실패 무시). 제출 전 **`AlertDialog`(controlled) 입력 확인창** → 확인 시 `requestSubmit()`. **`/mypage`**(`src/app/mypage/page.tsx`, server): 로그인 가드(`redirect("/login?next=/mypage")`), `applications`를 본인 user_id로 조회 → 웰컴 배너 + 회원정보/신청내역 **네이티브 `<details>` 아코디언**(클라 JS 0). Navbar는 로그인 시 "마이페이지"(+admin이면 "관리자") 링크 노출(`layout.tsx`가 `isAdmin` prop 전달).

**admin 대시보드** (Phase 5, `src/app/admin/`): `layout.tsx`(server)가 **role 가드**(`!user`→`/login?next=/admin`, `!isAdmin`→`/`) + `AdminNav`(client, 3탭). 3 섹션 — `page.tsx`(신청), `members/`, `youtube/`. 각 server page가 **`createAdminClient()`(service_role, RLS 우회)**로 데이터 조회 → client 매니저(`src/components/admin/{ApplicationsManager,MembersManager,YoutubeManager}`)가 검색·필터·CRUD. 회원은 `admin.auth.admin.listUsers` + `profiles.role` merge. 쓰기는 `src/app/admin/actions.ts`(`"use server"`) — **모든 액션 첫 줄 `requireAdmin()`(세션 클라로 isAdmin 재확인) 후 service_role 쓰기**. 신청 `updateApplication`(status/admin_note), 유튜브 `add/update/setVisibility/delete`(`revalidatePath("/admin/youtube")`+`"/"`로 랜딩 갱신). **랜딩 유튜브 섹션은 `youtube_videos`(is_visible=true) 조회 → 비면 mock `VIDEOS` fallback.**

### 인증 라우트 (Supabase Server Actions)

폼 5종 + OAuth는 `src/app/(auth)/` route group(괄호는 URL 미노출). `/auth/confirm`만 `src/app/auth/confirm/`로 분리(메일/OAuth가 URL 직접 참조).
- **`/login`** — page는 로그인 상태면 `/`로 redirect. `searchParams`: `error=auth-code-error`(빨강+회원가입 링크), `verified=pending`(녹색). `login()`은 `signInWithPassword` 실패 시 분기: `email_not_confirmed`→재발송(`canResend:true`); `invalid_credentials`→`getUserIdentitySummary()`로(`!found`→미가입 / `hasPassword`→비번 불일치 / `!hasPassword`→카카오 계정 안내), `null`→일시 오류. `resendConfirmation(email)`도 export(`resend({type:"signup"})`, Login/Signup 공유). rate limit + 이메일 검증. 배너는 `AuthBannerSlot`.
- **`/signup`** — **회원가입 동선 brand-blue 통일**(제출버튼·AlertDialogAction·"로그인" 링크·Eye ring·Navbar "회원가입"). 색 되돌리려면 이 네 곳 함께. page는 로그인 시 `/` redirect. 이메일/비번(**8자+**)/확인 검증 후 **`signUp()` 전 `getUserIdentitySummary(email)` 사전 검사**: `!found`→가입 진행 / `found&&!confirmed`→"이미 가입 시도"(`canResend`) / `found&&hasPassword`→로그인 안내 / `found&&!hasPassword`→카카오 안내. **⚠️ 핵심 보안: Supabase는 미확인 사용자 재가입 시 비번을 덮어쓰므로 이 사전 검사로 계정 탈취 차단. `!found`일 때만 `signUp({options:{emailRedirectTo:${origin}/auth/confirm}})` — 순서 절대 유지.** `null`→fail closed. signUp 후 `user_already_exists`/빈 `identities` 분기는 race condition 안전망. rate limit(IP 5분/5회).
- **`/logout`** — `logout()`: `signOut()` → `revalidatePath("/","layout")` → `redirect("/")`. Navbar 폼에서만 호출.
- **`/forgot-password`** — page 로그인 시 `/` redirect. `error=link-expired`→빨강 배너. `emailExists()` 확인 후 `resetPasswordForEmail(email,{redirectTo:${origin}/auth/confirm?next=/reset-password})`. rate limit(이메일 1분/1회).
- **`/reset-password`** — **세션 필수**(page에서 `getUser()`, 미인증 시 `/forgot-password`). `resetPassword()`: (1) 비번 검증(8자+, 확인), (2) **새 비번≠기존**(임시 `persistSession:false` client로 `signInWithPassword` 시도), (3) `updateUser({password})`, (4) **`signOut({scope:"others"})`**(타 기기 무효화), (5) `redirect("/?reset=success")`.
- **`/auth/confirm`** — GET route handler. 세 형식: `token_hash`+`type`→`verifyOtp()`; `code`→`exchangeCodeForSession()`(PKCE/OAuth 공용); `flow=oauth`→OAuth 식별. **`next`는 open redirect 방지로 `/`시작 & `//`아닌 경로만 허용**, 아니면 `/`. recovery 식별(`type==="recovery"` 또는 `next.startsWith("/reset-password")`). 성공: 비-recovery는 `verified=success`(이메일)/`login=success`(OAuth) 부착, recovery는 `next`로. 실패: recovery→`/forgot-password?error=link-expired`, 그 외→`/login?error=auth-code-error` 또는 `?verified=pending`. **두 분기 모두 유지.**
- **카카오 OAuth** — `src/app/(auth)/oauth/actions.ts`의 `signInWithKakao()`: `signInWithOAuth({provider:"kakao",options:{redirectTo:${origin}/auth/confirm?next=/&flow=oauth}})` → `data.url`로 외부 redirect. 실패 시 `/login?error=auth-code-error`. **rate limit 없음**(카카오 throttling 의존). UI: `KakaoButton.tsx`(client, `useTransition`+SVG+Loader2)가 Login/Signup 양쪽 "또는" 구분선 아래.
- **폼 컴포넌트** `src/components/auth/{LoginForm,SignupForm,ForgotPasswordForm,ResetPasswordForm}.tsx`: 모두 **`useActionState` + `<form action={formAction}>`**, **입력은 controlled(`useState`+`value`+`onChange`)**(React 19 auto-reset & Base UI `defaultValue` 경고 회피). 비번 필드: `Eye`/`EyeOff` 토글(`type="button"`, ring) + `useCapsLockWarning`(`src/hooks/use-caps-lock.ts`). a11y: 에러 시 `aria-invalid` + `aria-describedby`(id: `login-error`/`signup-error`/`forgot-error`/`reset-error` + caps/hint), `role="alert"`, 한국어 존댓말. query 배너는 `AuthBannerSlot`.
- **재발송 UX**(Login/Signup 공통): (1) `<AlertDialog>` 확인 모달, (2) success 시 **60초 클라 쿨다운**(`cooldownSec` + `setInterval`, 버튼 disabled). 서버 rate limit(1분/1회)과 이중 보호. **SignupForm은 success/error 양쪽에 트리거** — 한쪽 수정 시 다른 쪽도 검토(조건부 숨김 시 카운트다운 회귀 주의).
- **로딩 스피너**: `Loader2 animate-spin` + 컨텍스트 텍스트("로그인 중" 등), **trailing `...` 금지**. shadcn Button 내부는 `<Loader2 className="animate-spin"/>` 한 줄, raw button은 `<span className="inline-flex items-center gap-1.5">`로 감쌈.

### 전자책 `/textbook/[course]` (레지스트리 기반, 교재 5종)

- **레지스트리** `src/data/textbook/index.ts` — `TEXTBOOK_REGISTRY: Textbook[]`(5종: `workhol`·`kitchen`·`grammar1`·`grammar2`·`cosmetic`). 각 `{course,title,subtitle,eyebrow,freeUnits[],units[]}`. **course는 DB `reading_progress.course` & URL segment & `content/textbook/<course>/` 폴더와 1:1.** `units`는 `unitsFromBook(bookKey)`로 `landing.ts` `BOOKS`(셀프디벨롭)에서 파생(중복 방지, `titleKr=sub`·`situation=u.situation??sub??""`) — `workhol`만 `workhol.ts`의 `WORKHOL_UNITS`(실 situation 포함) 직접 사용. kitchen·cosmetic은 `BOOKS`에 `situation` 채워져 실 소개, grammar는 situation 없어 `sub` 폴백(=titleKr). `grammar2`는 unit 번호 **25–48**(`freeUnits:[25]`). export: `getTextbook`/`getTextbookUnit`/`getAdjacentUnits`(유닛 배열 순서 기준 prev/next)/`TEXTBOOKS`(`{course,title,href}`, Navbar "교재 보기"가 `.map()`).
- `src/data/textbook/workhol.ts` — `WORKHOL_COURSE="workhol"`, `WORKHOL_UNITS`(5필드×24). 워홀 콘텐츠(폴더 `content/textbook/workhol`). ⚠️ 과거 course 키는 `cooking`이었고 마이그레이션 `20260609013944_rename_cooking_course_to_workhol.sql`로 `reading_progress.course`를 일괄 갱신.
- `[course]/page.tsx`(server) — `generateStaticParams`=레지스트리, `getTextbook`→`notFound()`. Unit 목록(카드=제목+부제+**소개문단**, 단 소개문단은 `situation!==titleKr`일 때만 렌더 — grammar는 sub 중복이라 숨김=랜딩과 동일), 로그인 시 `reading_progress`(course별, `completed`만) 1회 조회→"학습 완료됨"/"시작 전" 텍스트·`CheckCircle2`·`Lock`·**완료 카드 배경 `bg-progress/5 border-progress/40`**(랜딩 완료 카드와 동일). 잠금=`!user && !freeUnits.includes(unit)`, 자물쇠는 `/login?next=...`.
- `[course]/[unit]/page.tsx`(server) — `generateStaticParams`=레지스트리 flatMap, `notFound()`(course/unit 무효), **무료 외 미로그인 `redirect("/login?next=/textbook/<course>/<unit>")`**. HTML `content/textbook/<course>/<htmlFile>` `fs.readFile`→`TextbookViewer`. `prev/nextHref`는 `getAdjacentUnits`, `totalUnits`=최대 unit 번호(grammar2 라벨 "Unit 25/48"용).
- `src/app/textbook/actions.ts`(공유 `"use server"`) — **`setUnitCompleted(course,unit,completed)`**(수동 완료 정책 — 스크롤 자동 판정 없음). **진입 가드 순서 고정: (1) `getTextbook(course)` 화이트리스트, (2) unit이 해당 교재 `units`에 존재, (3) `getUser()` 없으면 silent.** `upsert({onConflict:"user_id,course,unit"})` 후 `revalidatePath("/")`+`"/textbook/<course>"`(랜딩·목록 완료 동기화). ⚠️ 과거 `saveScrollProgress`(스크롤 자동 진행률)는 제거됨.
- `src/components/textbook/TextbookViewer.tsx`(client) — **iframe `srcDoc`** 격리, `scrolling="no"` + `ResizeObserver` + 0.5/1.5s 재측정으로 높이 확장→부모 스크롤. 상·하단 `NavBar`(상단 `sticky top-[72px]`), prev/next는 **`prevHref`/`nextHref` 유무로 렌더**. 하단 **수동 완료 토글**(`CompletionToggle`, 로그인만): 미완료=`학습 완료로 표시` 버튼 / 완료=`학습 완료됨` 배지 + `완료 취소하기`(X) 버튼 분리. `initialCompleted` prop, `useTransition` 낙관적+실패 롤백. 액션 import는 `@/app/textbook/actions`.
- **HTML 본문**: 루트 `content/textbook/<course>/unit-XX.html`(완전한 HTML 문서, 2자리 zero-pad). **`src/` 아닌 `content/`**, `fs.readFile`(번들 미포함·public 아님). **새 교재 추가: (1) `content/textbook/<course>/unit-NN.html`, (2) `TEXTBOOK_REGISTRY`에 항목 추가(`units`는 `unitsFromBook` 또는 직접 작성), (3) 랜딩 연동하려면 `LINKED_COURSE`+`page.tsx` 쿼리 2곳.** 라우트·Navbar·진행률이 모두 레지스트리 기반이라 마이그레이션 불필요. ⚠️ 뷰어 iframe `srcDoc`은 sandbox 없어 **본문 내 `<script>` 실행됨**(모바일 가독성 검증은 헤드리스 Chrome으로 iframe 폭 렌더).
- **grammar1·grammar2 콘텐츠**(`content/textbook/grammar{1,2}/`)는 타 교재와 달리 **desktop/mobile 디자인 분리**: 데스크톱=`.page` 인쇄형(182mm), 모바일=`body.mobile` 규칙(테이블→카드화 등, specificity 높아 자체 `@media`보다 우선). `<body>` 직후 인라인 스크립트가 `matchMedia("(max-width:768px)")`로 `.mobile` 클래스 자동 토글(FOUC 방지 동기 실행+리사이즈 추종). **color 모드 고정**(`:root` 기본값), 과거 Color/B&W·Desktop/Mobile **toolbar는 제거됨**. workhol/kitchen은 단순 `@media` 반응형(class 없음).

### 헬퍼

- `src/lib/utils.ts` — `cn()`.
- `src/lib/auth.ts` — `getUserRole`/`isAdmin(supabase,userId)`(`profiles.role`, app_metadata 대신 profiles 우선).
- `src/lib/mailer.ts` — `sendApplicationNotification(to[],data)`(Resend, best-effort no-op, `import "server-only"`).
- `src/lib/origin.ts` — `getOrigin(headers)`: `NEXT_PUBLIC_SITE_URL`→`origin`→`x-forwarded-host`+proto→`host`.
- `src/lib/email.ts` — `isValidEmail()`(서버측 검증).
- `src/lib/rate-limit.ts` — in-memory 토큰 버킷 `rateLimit/getClientIp/formatRetryAfter`. **⚠️ 프로세스 메모리라 멀티 인스턴스(Vercel)에선 효과 제한** → 필요 시 Upstash Redis로 함수 내부만 교체.
- `src/hooks/use-caps-lock.ts` — `useCapsLockWarning()`, `capsLockHandlers` spread.

### Supabase SSR

- `client.ts`(`createBrowserClient`) · `server.ts`(`createServerClient`+cookies) · `middleware.ts`(`updateSession()` 매 요청 `getUser()`로 세션 갱신 — **`createServerClient`와 `getUser()` 사이 로직 금지**) · `admin.ts`(`service_role`, 첫 줄 `import "server-only"`).
- **`admin.ts` export**: `createAdminClient()` + `emailExists()`(@deprecated) + `getUserStatus()`(@deprecated) + **`getUserIdentitySummary(email)`**(권장: `{found:false}` | `{found:true,confirmed,hasPassword,oauthProviders[]}` | `null`) + **`getAdminEmails()`**(`profiles.role='admin'`→`getUserById`로 이메일, 신청 알림 수신자, 실패 시 `[]`). 내부: `listUsers`로 id 찾고 `getUserById(id)` 재호출해 `identities` 안전 확보(listUsers만으론 빈 배열로 옴). 모두 페이지네이션(perPage 1000, ≤50p) — **같은 액션에서 2번 호출 금지**. 에러 시 `null`(호출 측 "일시적 오류" 분기).
- `src/proxy.ts` — Next 16 `proxy` 컨벤션(v15 `middleware` 리네임), `updateSession` 호출, `matcher`로 정적 자산 제외. 헬퍼 `middleware.ts` 파일명은 유지.
- **환경 변수**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`(필수), `SUPABASE_SERVICE_ROLE_KEY`(admin용, **`NEXT_PUBLIC_` 절대 금지**), `NEXT_PUBLIC_SITE_URL`(운영 권장). **`RESEND_API_KEY`**(신청 알림 메일, 미설정 시 발송 no-op) + **`APPLICATION_NOTIFY_FROM`**(선택, 발신 주소 — Resend 인증 도메인; 미설정 시 `onboarding@resend.dev` 테스트 발신).
- **Dashboard 설정**: Site URL = 운영 도메인, Redirect URLs에 `https://<도메인>/auth/confirm` + `http://localhost:3000/**`. 권장 메일 템플릿: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/`. **카카오**: Kakao Developers에서 앱 생성 → REST 키+Secret → Redirect URI `https://<ref>.supabase.co/auth/v1/callback` → **이메일 "필수동의"**. Supabase Providers>Kakao 활성화 + **"Allow account linking" 활성화**(같은 이메일 이메일/카카오 자동 연결, 비활성 시 콜백 실패).

### DB 스키마 (`supabase/`)

마이그레이션은 `db:new`로만 생성(CLI는 timestamp 형식만 인식), Dashboard SQL 직접 실행 금지. link 정보는 `supabase/.temp/`(gitignore, 새 머신은 `npx supabase login` + `link --project-ref`). **⚠️ Claude는 CLI 원격 접근 불가(403) → `db:push`/`db:types`는 사용자가 직접 실행.** 핵심 마이그레이션 4개(+ `20260609013944` cooking→workhol 리네임, `20260609230959` `reading_progress.scroll_percent` 제거 — db:push·db:types 적용 완료):
- **`20260522065400_create_profiles_and_role_trigger.sql`**: `user_role` ENUM(`admin|teacher|student`); `profiles`(`id` PK FK→auth.users CASCADE, `role` DEFAULT 'student', `created_at`/`updated_at`); RLS + `profiles_select_own`/`_update_own`(`auth.uid()=id`, **INSERT/DELETE 정책 없음**); `handle_new_user()`(SECURITY DEFINER) + `on_auth_user_created` trigger(모든 가입 경로에서 `profiles` insert + `raw_app_meta_data`에 `{role:'student'}` merge); `tg_set_updated_at()` trigger. **backfill 포함**. **role 활용: admin 대시보드(`/admin`)에서 사용** — `src/lib/auth.ts`의 `isAdmin(supabase,userId)`(`profiles.role==='admin'`, app_metadata는 stale 가능해 profiles 우선).
- **`20260523231214_add_reading_progress.sql`**: `reading_progress`(복합 PK `(user_id,course,unit)`, `user_id` FK CASCADE, `course text`, `unit int [1,100]`, `completed bool DEFAULT false`, `last_viewed_at`); 인덱스 `(user_id,course)`; RLS + `_select/_insert/_update_own`(`auth.uid()=user_id`, **DELETE 정책 없음**). ⚠️ 최초엔 `scroll_percent int [0,100]` 컬럼도 있었으나 `20260609230959`에서 제거(수동 완료 정책).
- **`20260608233330_add_applications.sql`**: `application_status` ENUM(`신청|확인|완료|취소`); `applications`(`id` uuid PK, `user_id` FK→auth.users **ON DELETE SET NULL**(익명 리드 허용), `course`/`course_title`/`option`/`name`/`phone`/`email`/`memo`, `status` DEFAULT '신청', `admin_note`, `created_at`/`updated_at`); 인덱스 `(user_id)`/`(status)`/`(created_at desc)`; RLS + **`applications_insert`(`to anon,authenticated` `with check (user_id is null or =auth.uid())` — 익명/로그인 제출, user_id 위조 차단)** + `applications_select_own`(본인, mypage). **UPDATE/DELETE 사용자 정책 없음**(상태·admin_note는 admin service_role, Phase 5). `tg_set_updated_at` 재사용.
- **`20260608235010_add_youtube_and_admin.sql`**: `youtube_videos`(`id` uuid PK, `tag`/`url`/`title`/`description`, `is_visible` bool DEFAULT true, `sort_order` int, `created_at`/`updated_at`); 인덱스 `(is_visible,sort_order)`; RLS + **`youtube_videos_select_visible`(`to anon,authenticated` `using (is_visible=true)`)**, **쓰기 정책 없음**(admin service_role만); `tg_set_updated_at` 트리거; **시드 3건**. + **admin 부여 DO 블록**: `82orez@gmail.com`의 `profiles.role='admin'` & `auth.users.raw_app_meta_data.role='admin'`(계정 미존재 시 no-op).
- **타입** `src/types/database.types.ts`: `db:types`로 생성. **`db:push` 후 항상 재생성**(drift 방지). `Database["public"]["Tables"][...]["Row"|"Insert"|"Update"]`. (현재 SSR client는 `<Database>` 미적용 → `.from("applications")`·`.from("youtube_videos")` 등 untyped.)

## 주의사항

- **TS 느슨함**: `strict:false`, `noImplicitAny:false` — 타입 명시 확인 권장.
- **Tailwind v4 `@apply` 제한**: `@layer components` 안에서 다른 커스텀 컴포넌트 클래스 `@apply` 시 빌드 실패 → 유틸 추출 또는 JSX className 조합.
- **shadcn + `cn()`**: 신규 UI는 `src/components/ui/` 재사용 우선, 추가는 CLI. `base-nova`/`neutral` 변경 금지. className은 항상 `cn()`(직접 결합 시 tailwind-merge 누락).
- **Server Action + `useActionState` 유지**: `fetch` 없이 `<form action>`. 성공 시 `revalidatePath`→`redirect`, 실패 시 `{error}`(/`{success}`). 인증 액션 import는 `@/app/(auth)/<route>/actions`.
- **Controlled input 필수**: Base UI `defaultValue` 경고 + React 19 auto-reset → 항상 `useState`+`value`+`onChange`, round-trip 금지.
- **인증 액션 순서**: (1) 필수값 검증 (2) `rateLimit()` (3) `isValidEmail()` (4) Supabase 호출. rate limit 키는 `email.toLowerCase()`. redirect는 `getOrigin()`.
- **사용자 열거 노출은 의도된 정책**: login/signup/forgot 모두 가입/미가입 구분 — 변경 시 세 곳 함께.
- **⚠️ 미확인 사용자 비번 덮어쓰기 방지(절대 우회 금지)**: signup은 `signUp()` 전 `getUserIdentitySummary()`로 확인, `found&&!confirmed` 차단. `!summary.found`일 때만 `signUp()` 호출 순서 유지.
- **Prettier**: `printWidth:150`, `endOfLine:"crlf"`, `singleQuote:false`, `trailingComma:"all"`, `semi:true`, `tabWidth:2`, `prettier-plugin-tailwindcss`.
- **버튼 커서 금지**: 전역 규칙 있음 → `cursor-pointer` 추가 금지(`disabled:cursor-not-allowed`만 허용).
- **색상 토큰 우선**: hex arbitrary value 피하고 시맨틱 토큰 사용.
- **CTA/anchor**: 랜딩 `#courses`, 과정 상세 `#apply-form` 등 anchor + `scroll-behavior:smooth`. `<a>` 버튼화는 `buttonVariants()`+`cn()`.
- **모바일 메뉴 a11y 회귀 주의**(위 Navbar 항목 체인 유지).
- **DB 변경은 항상 마이그레이션**: `db:new`→검토→`db:push`. **`db:push`는 destructive** — 직후 `/signup` 회귀 테스트(가입 성공 + `profiles` row + `raw_app_meta_data.role='student'`). 파일명 수동 명명 금지.
- **⚠️ role은 `app_metadata`에만, `user_metadata` 절대 금지**(후자는 클라가 `updateUser({data})`로 수정 가능 → 권한 우회). role 읽기는 JWT `app_metadata.role` 또는 `profiles.role`만. role 부여 시 `admin.auth.admin.updateUserById(id,{app_metadata:{role}})` + `profiles` update 함께.
- **profiles RLS 최소(본인 row만)**: admin 전체 조회 정책 미구현 → 필요 시 `createAdminClient()` 우회. 향후 `profiles_admin_all` 정책 추가.
- **교재 완료 액션 가드 유지**(위 `src/app/textbook/actions.ts` 항목): `setUnitCompleted`은 레지스트리 화이트리스트+unit 존재 검증 후 upsert. 완료는 **사용자 수동 토글만**(스크롤 자동 판정 부활 금지).

## 별칭

`@/*` → `./src/*`. 이미지는 `next/image`만(`public/images/`). Favicon은 `src/app/icon.svg`(파일 컨벤션).

## 배포

Vercel 배포. `vercel.json`은 `regions:["icn1"]`(서울 리전 고정)만 설정 — 한국 사용자 대상 레이턴시 최적화. 환경 변수는 위 Supabase SSR 항목 참조.
