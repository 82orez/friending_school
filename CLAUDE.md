# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

"프렌딩 스쿨" 워홀 영어 교육 과정의 랜딩 페이지입니다. Next.js 15(App Router) + React 19 + Tailwind CSS v4 기반의 단일 페이지 마케팅 사이트이며, Supabase SSR 인증을 위한 기반 코드와 함께 shadcn/ui(`base-nova` 스타일, `neutral` baseColor) 컴포넌트, Supabase Server Actions 기반 이메일 인증 화면(`/login`, `/signup`, `/auth/confirm`)이 함께 구성되어 있습니다.

## 자주 사용하는 명령어

- 개발 서버 실행: `npm run dev` (Turbopack, 기본 포트 3000)
- 프로덕션 빌드: `npm run build` (Turbopack)
- 프로덕션 서버 실행: `npm start`
- shadcn 컴포넌트 추가: `npx shadcn@latest add <component>` (현재 `shadcn` v4.7.0 사용, `components.json` 별칭/스타일을 따라 생성됨)

별도의 lint/test 스크립트는 정의되어 있지 않습니다(테스트 프레임워크 미설치).

## 코드 구조 및 아키텍처

- **App Router 단일 페이지 구조**: 마케팅 콘텐츠 본문은 `src/app/page.tsx`(서버 컴포넌트) 한 파일에 모두 들어 있습니다. 섹션(히어로, 후회 3가지, 차별점, 과정 정보, 후기, 커리큘럼, CTA 등)은 별도 컴포넌트로 분리되어 있지 않고 파일 상단의 데이터 배열(`reasons`, `lastReason`, `opportunityCards`, `infoCards`, `reviewsTop`, `reviewBottom`, `units`)을 `.map()`으로 렌더링합니다. 섹션 카피/항목을 수정할 때는 해당 데이터 배열을 먼저 찾아 편집하는 것이 빠릅니다.
- **공통 컴포넌트**: 네비게이션 바(슬라이드 메뉴 포함)와 푸터는 `src/components/Navbar.tsx`, `src/components/Footer.tsx`로 분리되어 `src/app/layout.tsx`에서 `{children}`을 감싸도록 배치됩니다. `Navbar`는 슬라이드 메뉴 상태(`useState`) 때문에 `"use client"` 클라이언트 컴포넌트이며, `Footer`는 서버 컴포넌트입니다. 전역 색상/폰트(`bg-white font-sans text-[#1a1a1a]`)는 `layout.tsx`의 `<body>` 클래스에 적용되어 있고, `<html>` 클래스는 `cn("font-sans", geist.variable)`로 합성됩니다.
- **루트 레이아웃**: `src/app/layout.tsx`에서 `lang="ko"`, 한글 메타데이터, Pretendard 가변 폰트(`next/font/local`로 `node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2` 로드, `--font-pretendard` CSS 변수)를 설정하고, `next/font/google`의 `Geist`를 추가로 로드해 `<html>`에 `geist.variable`(`--font-sans`)을 적용합니다. 다만 `globals.css`의 `@theme inline { --font-sans: var(--font-pretendard); }` 매핑 때문에 **`font-sans` 유틸리티의 실제 글꼴은 Pretendard**이며, Geist 변수는 현재 본문에 직접 사용되지는 않습니다(향후 영문 전용 컴포넌트용). 페이지 제목/설명은 한국어 마케팅 카피이므로 변경 시 SEO 영향을 고려해야 합니다.
- **스타일링**: Tailwind CSS v4를 `src/app/globals.css`의 `@import "tailwindcss"` + `@import "tw-animate-css"` + `@import "shadcn/tailwind.css"` + `@theme inline` 방식으로 사용합니다(별도 `tailwind.config` 파일 없음). `@custom-variant dark (&:is(.dark *))`로 다크 모드 변형을 등록하며, `@theme inline`에 shadcn 색상 토큰(`--color-background`, `--color-primary`, `--color-card`, `--color-muted`, `--color-destructive`, `--color-sidebar-*`, `--color-chart-1~5`)과 `--radius-{sm,md,lg,xl,2xl,3xl,4xl}` 스케일을 매핑합니다. `:root`/`.dark` 블록에 OKLch 기반 라이트·다크 값이 정의되어 있으며, 다크 모드는 `<html class="dark">` 토글 방식으로 CSS만 준비된 상태입니다(토글러 미구현). `--font-sans`는 `--font-pretendard`에 매핑되어 있고, 페이지 내 강조색은 shadcn `--primary`와 별개로 **브랜드 레드 `#ff4757`**(CTA/포인트 색상)이 인라인 클래스에서 일관되게 사용됩니다. PostCSS는 `@tailwindcss/postcss` 플러그인 하나만 사용합니다(`postcss.config.mjs`).
- **shadcn/ui 통합**: 설정은 `components.json`(`style: "base-nova"`, `baseColor: "neutral"`, `cssVariables: true`, `iconLibrary: "lucide"`, RSC 활성화)에 있고, 별칭은 `@/components`, `@/components/ui`, `@/lib`, `@/lib/utils`, `@/hooks`로 등록되어 있습니다. 현재 추가된 UI 컴포넌트는 `src/components/ui/{button,card,input,label}.tsx`입니다. className 병합용 `cn()` 유틸은 `src/lib/utils.ts`에 `clsx` + `tailwind-merge` 조합으로 구현되어 있고, 모든 shadcn 컴포넌트가 이를 사용하므로 새 컴포넌트 작성 시에도 동일하게 사용해야 합니다. 아이콘은 `lucide-react`, 헤드리스 프리미티브는 `@base-ui/react`, 애니메이션 보조 클래스는 `tw-animate-css`를 사용합니다.
- **인증 라우트(Supabase Server Actions)**: 이메일/비밀번호 로그인·회원가입과 이메일 OTP 확인 플로우가 다음과 같이 구성되어 있습니다.
  - `/login` — `src/app/login/page.tsx`(서버 컴포넌트, `searchParams.error === "auth-code-error"`이면 인증 링크 만료 안내 표시) + `src/app/login/actions.ts`의 `login()` 서버 액션. 액션은 `supabase.auth.signInWithPassword` 호출, 성공 시 `revalidatePath("/", "layout")` 후 `redirect("/")`, 실패 시 `{ error }` 반환.
  - `/signup` — `src/app/signup/page.tsx` + `src/app/signup/actions.ts`의 `signup()` 서버 액션. 이메일/비밀번호(6자 이상)/비밀번호 확인을 검증한 뒤 `supabase.auth.signUp({ options: { emailRedirectTo: ${origin}/auth/confirm } })` 호출. 성공 시 자동 redirect 없이 `{ success }` 메시지로 메일함 확인 안내.
  - `/auth/confirm` — `src/app/auth/confirm/route.ts`의 GET 라우트 핸들러. 두 가지 이메일 인증 형식을 모두 처리: (1) `token_hash` + `type`이 있으면 `supabase.auth.verifyOtp()`로 검증(Supabase SSR 가이드 템플릿용), (2) `code`가 있으면 `supabase.auth.exchangeCodeForSession()`으로 PKCE 코드 교환(Supabase **기본** 이메일 템플릿 `{{ .ConfirmationURL }}` 사용 시 이쪽). 성공 시 `next`(기본 `/`)로 redirect, 실패 시 `/login?error=auth-code-error`로 redirect. `@supabase/ssr`이 기본 PKCE 플로우이므로 둘 중 하나만 골라 한쪽 분기만 남기지 말고 두 분기 모두 유지할 것.
  - 폼 컴포넌트: `src/components/auth/{LoginForm,SignupForm}.tsx`. 둘 다 클라이언트 컴포넌트로 **React 19 `useActionState` 훅 + `<form action={formAction}>` 패턴**을 사용하며, 에러 메시지와 `pending` 상태는 액션 반환값과 훅의 `pending` 플래그로 표시합니다. 사용자에게 노출되는 모든 에러/안내 메시지는 한국어 존댓말(마침표 포함)로 작성됩니다.
- **자산**: 이미지/로고는 `public/images/`에 위치하며 `<img src="/images/...">`로 직접 참조됩니다 (`next/image` 미사용). Favicon은 Next.js App Router 파일 컨벤션을 따라 `src/app/icon.svg`로 두면 자동으로 `<head>`에 `<link rel="icon" type="image/svg+xml">`이 주입됩니다(`layout.tsx`에 별도 `metadata.icons` 설정 없음).
- **경로 별칭**: `@/*` → `./src/*` (tsconfig.json).
- **Supabase 인증 SSR 구조**: `@supabase/ssr` + `@supabase/supabase-js`를 사용해 세 가지 컨텍스트별 클라이언트를 분리해 둡니다.
  - `src/utils/supabase/client.ts` — 클라이언트 컴포넌트용 `createBrowserClient`.
  - `src/utils/supabase/server.ts` — 서버 컴포넌트/Route Handler용 `createServerClient` (Next의 `cookies()` 스토어 주입).
  - `src/utils/supabase/middleware.ts` — `updateSession()`이 매 요청마다 `supabase.auth.getUser()`를 호출해 쿠키 기반 세션을 갱신합니다. **`createServerClient`와 `getUser()` 사이에 다른 로직을 두지 말 것** (세션 갱신 누락으로 사용자가 임의로 로그아웃될 수 있음).
  - `src/middleware.ts`가 위 `updateSession`을 호출하며, `matcher`로 정적 자산(`_next/static`, `_next/image`, 이미지 확장자, `favicon.ico`)을 제외한 모든 경로에서 동작합니다.
  - 필요한 환경 변수: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (예: `.env.local`). 미설정 시 미들웨어 단계에서 런타임 오류가 발생합니다.

## 작업 시 주의사항

- **TypeScript 설정이 느슨함**: `tsconfig.json`에서 `strict: false`, `noImplicitAny: false`로 설정되어 있습니다. 빌드 시 타입 오류가 잡히지 않을 수 있으므로 명시적으로 타입을 확인하는 것이 안전합니다.
- **Tailwind v4 `@apply` 제한**: `@layer components` 안에서 `@apply`로 다른 커스텀 컴포넌트 클래스를 참조하면 빌드가 실패합니다. 컴포넌트 클래스 간 재사용이 필요하면 별도 유틸리티 클래스로 추출하거나 JSX 측에서 className을 직접 조합하세요.
- **shadcn 컴포넌트와 `cn()` 사용 규칙**: 신규 UI 요소는 우선 `src/components/ui/`의 shadcn 컴포넌트(`Button`, `Card`, `Input`, `Label` 등) 재사용을 고려하고, 추가가 필요하면 shadcn CLI(`npx shadcn@latest add ...`)로 추가합니다. `components.json`의 `style: "base-nova"`/`baseColor: "neutral"`을 변경하지 마세요. className 조합은 항상 `@/lib/utils`의 `cn()`을 통해 처리해야 합니다(문자열을 직접 결합하면 `tailwind-merge`가 누락되어 충돌하는 Tailwind 클래스가 중복으로 출력됩니다).
- **Server Action + `useActionState` 패턴 유지**: 인증 폼은 클라이언트에서 `fetch` 호출 없이 `<form action={formAction}>` + `useActionState`로 통신합니다. 새 폼을 추가할 때도 동일한 패턴(`"use server"` 액션 파일 + 클라이언트 폼 컴포넌트 + 한국어 검증 메시지)을 따르고, 액션은 성공 시 `revalidatePath` 후 `redirect`, 실패 시 `{ error }`(필요하면 `{ success }`)를 반환하도록 작성하세요.
- **Prettier 규칙**: `printWidth: 150`, `endOfLine: "crlf"`, `singleQuote: false`(큰따옴표), `trailingComma: "all"`, `semi: true`, `tabWidth: 2`, `prettier-plugin-tailwindcss` 사용. Tailwind 클래스 정렬은 플러그인에 맡깁니다.
