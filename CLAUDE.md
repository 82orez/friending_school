# CLAUDE.md

Claude Code 작업 지침. 이 파일은 매 세션 로드되므로 **항상 압축적으로** 작성/갱신할 것(토큰 절감).

## 개요

"프렌딩 스쿨" 워홀 영어 과정 랜딩 페이지. Next.js 16(App Router, Turbopack) + React 19.2 + Tailwind v4. shadcn/ui(`base-nova`/`neutral`), Supabase SSR 인증(이메일 + 카카오 OAuth), 전자책 뷰어 `/textbook/[course]`(레지스트리 기반 교재 5종, 무료 미리보기 외 로그인 필수) 포함.

## 명령어

- `npm run dev` / `npm run build` / `npm start` (모두 Turbopack)
- shadcn 추가: `npx shadcn@latest add <component>` (v4.7.0, `components.json` 따름)
- DB: `db:new <name>`(마이그레이션 파일 생성) · `db:push`(원격 적용, **destructive**) · `db:list`(적용 이력 비교) · `db:diff`(`--linked`) · `db:types`(→ `src/types/database.types.ts`, 첫 실행 전 `mkdir -p src/types`)
- lint/test 스크립트 없음(테스트 프레임워크 미설치). Supabase CLI는 `devDependencies`에 있어 `npx supabase ...` 사용.

## 아키텍처

**랜딩 페이지** `src/app/page.tsx`(서버 컴포넌트, 단일 파일). 섹션은 파일 상단 데이터 배열(`reasons`, `lastReason`, `opportunityCards`, `infoCards`, `reviewsTop`, `reviewBottom`, `units`)을 `.map()`. 카피 수정 시 해당 배열 먼저 편집. `async`로 `searchParams` 받아 `reset=success`/`verified=success`/`login=success` 시 hero 위 녹색 배너. 시맨틱: `<h1>` 1개, 섹션 `<h2>`, 카드 `<h3>`. 카드 컨테이너는 모두 `SectionCard` wrapper. 반응형은 모바일 기본값 + `md:` 분기. CTA 두 곳(히어로 `<a href="#apply">` + 최종 `<section id="apply">`의 `<ApplyForm/>`)은 Navbar "신청방법"과 anchor 공유.

**공통 컴포넌트** `Navbar.tsx`(client, 슬라이드 메뉴)·`Footer.tsx`(server)는 `layout.tsx`에서 children 감쌈.
- Navbar는 `user: { email? } | null` prop을 SSR로 받고, `onAuthStateChange` 구독 + `pageshow`(bfcache) 리스너로 stale 방지. 로고는 `next/image`(`width=107 height=40`, 원본비 1664:624, `priority`).
- 모바일 메뉴 항목 3종(순서 고정): `#curriculum`, `#apply`, **"교재 보기"(확장 토글, 항상 맨 아래)**. anchor는 `<a href>`, 라우트는 `<Link href>`, 모두 `onClick={closeMenu}` 필수. "교재 보기"는 `<button>` 토글로 `TEXTBOOKS`(`src/data/textbook/index.ts`)를 펼침(`textbookOpen` state, `aria-expanded/controls`, grid `0fr→1fr` 트릭). 메뉴 닫힐 때 `textbookOpen`도 false 동기화. 새 교재는 `TEXTBOOKS`에 push만 하면 자동 반영.
- a11y: 햄버거 `aria-expanded`·`aria-controls="mobile-menu"`, 메뉴 `role="dialog"`·`aria-modal`·`aria-hidden`·`inert={!menuOpen}`, `bg-black/40` 오버레이, 열림 시 닫기버튼 포커스·닫힘 시 햄버거 복귀(`triggerRef`/`closeButtonRef`/`prevMenuOpen`), body scroll lock, Esc 닫기. **수정 시 이 체인 유지.**
- 로그아웃은 `@/app/(auth)/logout/actions`의 `logout()`을 `<form action={logout}>`로 호출.

**루트 레이아웃** `src/app/layout.tsx`(async server): `createClient(await cookies()).auth.getUser()` → `<Navbar user>`. `<AuthHashHandler/>`(`src/components/auth/`)를 마운트해 implicit hash(`#access_token=...`) 토큰을 client에서 `setSession` 후 `/?verified=success` 또는 `/reset-password`로 replace. `lang="ko"`, Pretendard(`next/font/local`, `--font-pretendard`) + Geist(`--font-sans`). **단, `globals.css`의 `@theme inline`이 `--font-sans → --font-pretendard` 매핑이라 `font-sans`는 Pretendard.**

**스타일링** Tailwind v4: `globals.css`의 `@import` + `@theme inline`(별도 config 없음). `@custom-variant dark`. 토큰 두 그룹: (1) shadcn 색상/`--radius-*`(OKLch), (2) **마케팅 시맨틱 색 9종**: `--color-brand`(#ff4757, 메인 CTA), `--color-brand-blue`(#2563eb, **회원가입 동선 전용**), `--color-ink`(#1a1a1a), `--color-ink-soft`(#333), `--color-surface`(#f8f8f8), `--color-muted-fg`(#666), `--color-muted-fg-faint`(#999), `--color-rule`(#eee), `--color-rule-faint`(#ddd). 클래스: `bg-brand`, `text-brand`, `bg-brand/90`(알파 슬래시 OK) 등. **새 코드는 하드코딩 hex 금지, 토큰 클래스 사용**(예외 단발성: #2d2d2d 그래디언트 끝, #ff6b7a, #ffc107 별점, #555, #888). 다크모드 미구현(라이트 전용). `@layer base`: 활성 버튼 `cursor:pointer` 전역 + `html{scroll-behavior:smooth}`.

**shadcn/ui** `components.json`(`base-nova`/`neutral`/lucide/RSC). UI: `src/components/ui/{button,card,input,label,textarea,alert-dialog,calendar,popover,select}.tsx`. `select.tsx`는 미사용·untracked. `calendar.tsx`/`popover.tsx`도 현재 미사용(날짜 필요 시 `date-fns`(^4) + `react-day-picker`(^10) 재사용, 한국어 `locale={ko}` 필수). `cn()`은 `src/lib/utils.ts`(clsx+tailwind-merge), 항상 사용. 아이콘 `lucide-react`, 프리미티브 `@base-ui/react`, 애니메이션 `tw-animate-css`.
- **Button variant**: shadcn 기본 + 추가 4종 — `brand`(빨강 primary), `brand-blue`(파랑, **회원가입 동선 전용**: SignupForm 제출·AlertDialogAction "보내기"·ApplyForm 제출), `brand-inverse`(흰, 빨강 배경 위), `kakao`(#FEE500/#191919, `KakaoButton` 전용, 고정 hex). `buttonVariants`로 `<a>`에도 적용.
- ⚠️ **base-nova**: `AlertDialogAction`은 `Close`로 안 감싸져 **클릭해도 모달 자동 안 닫힘** → onClick에서 `setOpen(false)` 또는 controlled 사용. `AlertDialogCancel`은 정상.

**`SectionCard`** (`src/components/SectionCard.tsx`): 마케팅 카드 div wrapper. variant 3종 — `accent-left`(`border-l-[6px] border-brand bg-surface`, 후회·커리큘럼), `outline`(`border border-rule bg-surface`, 기회·리뷰), `plain`(`bg-surface`, 정보·소개). `rounded/p/text-center`는 호출 측 className. shadcn `Card`(슬롯 포함)는 콘텐츠 컨테이너용으로 별개.

**`ApplyForm`** (`src/components/ApplyForm.tsx`, client): 최종 CTA 본문. controlled 입력 4종(이름·전화·이메일(선택)·희망 날짜/시간=`<Textarea rows={4}>` 자유 형식). grid `grid-cols-1 md:grid-cols-2`, 이메일·날짜는 `md:col-span-2`. 제출 `variant="brand-blue"`, 흰 카드(`bg-white text-ink`). 성공 시 ✓ 박스(`role="status"`)로 교체. 폼 `aria-labelledby="apply-heading"`.
- ⚠️ **현재 mock**: `handleSubmit`이 `console.log` + `setTimeout(()=>setSubmitted(true),400)`뿐, **실제 저장 미구현**. 운영 전 `"use server"` 액션 + `useActionState` + 서버 검증(`isValidEmail`/전화) + `getOrigin()` 알림/저장 추가. 전환 시 `<form action={formAction}>` + controlled state 유지.

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

- **레지스트리** `src/data/textbook/index.ts` — `TEXTBOOK_REGISTRY: Textbook[]`(5종: `cooking`·`kitchen`·`grammar1`·`grammar2`·`cosmetic`). 각 `{course,title,subtitle,eyebrow,freeUnits[],units[]}`. **course는 DB `reading_progress.course` & URL segment와 1:1.** `units`는 `unitsFromBook(bookKey)`로 `landing.ts` `BOOKS`(셀프디벨롭)에서 파생(중복 방지) — `cooking`만 `cooking.ts`의 `COOKING_UNITS` 직접 사용. `grammar2`는 unit 번호 **25–48**(`freeUnits:[25]`). export: `getTextbook`/`getTextbookUnit`/`getAdjacentUnits`(유닛 배열 순서 기준 prev/next)/`TEXTBOOKS`(`{course,title,href}`, Navbar "교재 보기"가 `.map()`).
- `src/data/textbook/cooking.ts` — `COOKING_COURSE="cooking"`, `COOKING_UNITS`(5필드×24). 기존 워홀 콘텐츠(URL/DB 유지).
- `[course]/page.tsx`(server) — `generateStaticParams`=레지스트리, `getTextbook`→`notFound()`. Unit 목록, 로그인 시 `reading_progress`(course별) 1회 조회→진행률 바·`CheckCircle2`·`Lock`. 잠금=`!user && !freeUnits.includes(unit)`, 자물쇠는 `/login?next=...`.
- `[course]/[unit]/page.tsx`(server) — `generateStaticParams`=레지스트리 flatMap, `notFound()`(course/unit 무효), **무료 외 미로그인 `redirect("/login?next=/textbook/<course>/<unit>")`**. HTML `content/textbook/<course>/<htmlFile>` `fs.readFile`→`TextbookViewer`. `prev/nextHref`는 `getAdjacentUnits`, `totalUnits`=최대 unit 번호(grammar2 라벨 "Unit 25/48"용).
- `src/app/textbook/actions.ts`(공유 `"use server"`) — `saveScrollProgress(course,unit,percent,completed)`. **진입 가드 순서 고정: (1) `getTextbook(course)` 화이트리스트, (2) unit이 해당 교재 `units`에 존재, (3) percent `Number.isFinite`+0~100 clamp, (4) `getUser()` 없으면 silent.** `upsert({onConflict:"user_id,course,unit"})`, **기존 `completed`를 먼저 읽어 OR 결합**(read-then-merge 깨지 말 것).
- `src/components/textbook/TextbookViewer.tsx`(client) — **iframe `srcDoc`** 격리, `scrolling="no"` + `ResizeObserver` + 0.5/1.5s 재측정으로 높이 확장→부모 스크롤. 상·하단 `NavBar`(상단 `sticky top-[72px]`), prev/next는 **`prevHref`/`nextHref` 유무로 렌더**. 초기 복원 load 후 `requestAnimationFrame` 1회(`scrollRestored` 가드). 저장 로그인만, `SAVE_IDLE_MS=1000` 디바운스+`lastSentPercentRef` skip, `COMPLETED_THRESHOLD=95`. 액션 import는 `@/app/textbook/actions`.
- **HTML 본문**: 루트 `content/textbook/<course>/unit-XX.html`(완전한 HTML 문서, 2자리 zero-pad). **`src/` 아닌 `content/`**, `fs.readFile`(번들 미포함·public 아님). **새 교재 추가: (1) `content/textbook/<course>/unit-NN.html`, (2) `TEXTBOOK_REGISTRY`에 항목 추가(`units`는 `unitsFromBook` 또는 직접 작성).** 라우트·Navbar·진행률이 모두 레지스트리 기반이라 마이그레이션 불필요.

### 헬퍼

- `src/lib/utils.ts` — `cn()`.
- `src/lib/origin.ts` — `getOrigin(headers)`: `NEXT_PUBLIC_SITE_URL`→`origin`→`x-forwarded-host`+proto→`host`.
- `src/lib/email.ts` — `isValidEmail()`(서버측 검증).
- `src/lib/rate-limit.ts` — in-memory 토큰 버킷 `rateLimit/getClientIp/formatRetryAfter`. **⚠️ 프로세스 메모리라 멀티 인스턴스(Vercel)에선 효과 제한** → 필요 시 Upstash Redis로 함수 내부만 교체.
- `src/hooks/use-caps-lock.ts` — `useCapsLockWarning()`, `capsLockHandlers` spread.

### Supabase SSR

- `client.ts`(`createBrowserClient`) · `server.ts`(`createServerClient`+cookies) · `middleware.ts`(`updateSession()` 매 요청 `getUser()`로 세션 갱신 — **`createServerClient`와 `getUser()` 사이 로직 금지**) · `admin.ts`(`service_role`, 첫 줄 `import "server-only"`).
- **`admin.ts` export**: `createAdminClient()` + `emailExists()`(@deprecated) + `getUserStatus()`(@deprecated) + **`getUserIdentitySummary(email)`**(권장: `{found:false}` | `{found:true,confirmed,hasPassword,oauthProviders[]}` | `null`). 내부: `listUsers`로 id 찾고 `getUserById(id)` 재호출해 `identities` 안전 확보(listUsers만으론 빈 배열로 옴). 모두 페이지네이션(perPage 1000, ≤50p) — **같은 액션에서 2번 호출 금지**. 에러 시 `null`(호출 측 "일시적 오류" 분기).
- `src/proxy.ts` — Next 16 `proxy` 컨벤션(v15 `middleware` 리네임), `updateSession` 호출, `matcher`로 정적 자산 제외. 헬퍼 `middleware.ts` 파일명은 유지.
- **환경 변수**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`(필수), `SUPABASE_SERVICE_ROLE_KEY`(admin용, **`NEXT_PUBLIC_` 절대 금지**), `NEXT_PUBLIC_SITE_URL`(운영 권장).
- **Dashboard 설정**: Site URL = 운영 도메인, Redirect URLs에 `https://<도메인>/auth/confirm` + `http://localhost:3000/**`. 권장 메일 템플릿: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/`. **카카오**: Kakao Developers에서 앱 생성 → REST 키+Secret → Redirect URI `https://<ref>.supabase.co/auth/v1/callback` → **이메일 "필수동의"**. Supabase Providers>Kakao 활성화 + **"Allow account linking" 활성화**(같은 이메일 이메일/카카오 자동 연결, 비활성 시 콜백 실패).

### DB 스키마 (`supabase/`)

마이그레이션은 `db:new`로만 생성(CLI는 timestamp 형식만 인식), Dashboard SQL 직접 실행 금지. link 정보는 `supabase/.temp/`(gitignore, 새 머신은 `npx supabase login` + `link --project-ref`). 적용 마이그레이션 2개:
- **`20260522065400_create_profiles_and_role_trigger.sql`**: `user_role` ENUM(`admin|teacher|student`); `profiles`(`id` PK FK→auth.users CASCADE, `role` DEFAULT 'student', `created_at`/`updated_at`); RLS + `profiles_select_own`/`_update_own`(`auth.uid()=id`, **INSERT/DELETE 정책 없음**); `handle_new_user()`(SECURITY DEFINER) + `on_auth_user_created` trigger(모든 가입 경로에서 `profiles` insert + `raw_app_meta_data`에 `{role:'student'}` merge); `tg_set_updated_at()` trigger. **backfill 포함**. role 활용은 미구현(저장 인프라만).
- **`20260523231214_add_reading_progress.sql`**: `reading_progress`(복합 PK `(user_id,course,unit)`, `user_id` FK CASCADE, `course text`, `unit int [1,100]`, `scroll_percent int [0,100] DEFAULT 0`, `completed bool DEFAULT false`, `last_viewed_at`); 인덱스 `(user_id,course)`; RLS + `_select/_insert/_update_own`(`auth.uid()=user_id`, **DELETE 정책 없음**).
- **타입** `src/types/database.types.ts`: `db:types`로 생성. **`db:push` 후 항상 재생성**(drift 방지). `Database["public"]["Tables"][...]["Row"|"Insert"|"Update"]`.

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
- **CTA/anchor**: `#apply` 등 anchor 공유 + `scroll-behavior:smooth`. `<a>` 버튼화는 `buttonVariants()`+`cn()`.
- **모바일 메뉴 a11y 회귀 주의**(위 Navbar 항목 체인 유지).
- **DB 변경은 항상 마이그레이션**: `db:new`→검토→`db:push`. **`db:push`는 destructive** — 직후 `/signup` 회귀 테스트(가입 성공 + `profiles` row + `raw_app_meta_data.role='student'`). 파일명 수동 명명 금지.
- **⚠️ role은 `app_metadata`에만, `user_metadata` 절대 금지**(후자는 클라가 `updateUser({data})`로 수정 가능 → 권한 우회). role 읽기는 JWT `app_metadata.role` 또는 `profiles.role`만. role 부여 시 `admin.auth.admin.updateUserById(id,{app_metadata:{role}})` + `profiles` update 함께.
- **profiles RLS 최소(본인 row만)**: admin 전체 조회 정책 미구현 → 필요 시 `createAdminClient()` 우회. 향후 `profiles_admin_all` 정책 추가.
- **교재 진행률 가드/완료 유지**(위 `cooking/actions.ts` 항목): 화이트리스트+범위 검증 4가드 + read-then-merge 깨지 말 것.

## 별칭

`@/*` → `./src/*`. 이미지는 `next/image`만(`public/images/`). Favicon은 `src/app/icon.svg`(파일 컨벤션).

## 배포

Vercel 배포. `vercel.json`은 `regions:["icn1"]`(서울 리전 고정)만 설정 — 한국 사용자 대상 레이턴시 최적화. 환경 변수는 위 Supabase SSR 항목 참조.
