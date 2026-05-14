# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

"프렌딩 스쿨" 워홀 영어 교육 과정의 랜딩 페이지입니다. Next.js 15(App Router) + React 19 + Tailwind CSS v4 기반의 단일 페이지(`src/app/page.tsx`) 마케팅 사이트입니다.

## 자주 사용하는 명령어

- 개발 서버 실행: `npm run dev` (Turbopack 사용, 기본 포트 3000)
- 프로덕션 빌드: `npm run build` (Turbopack 사용)
- 프로덕션 서버 실행: `npm start`

별도의 lint/test 스크립트는 정의되어 있지 않습니다(테스트 프레임워크 미설치).

## 코드 구조 및 아키텍처

- **App Router 단일 페이지 구조**: 마케팅 콘텐츠 본문은 `src/app/page.tsx`(서버 컴포넌트)에 단일 파일로 구현되어 있습니다. 섹션(히어로, 후회 3가지, 차별점, 과정 정보, 후기, 커리큘럼, CTA 등)은 별도 컴포넌트로 분리되지 않고 같은 파일 안에서 데이터 배열(`reasons`, `opportunityCards`, `infoCards`, `units` 등)을 `.map()`으로 렌더링합니다. 섹션을 수정할 때는 해당 데이터 배열을 먼저 찾아 편집하는 것이 빠릅니다.
- **공통 컴포넌트**: 네비게이션 바(슬라이드 메뉴 포함)와 푸터는 `src/components/Navbar.tsx`, `src/components/Footer.tsx`로 분리되어 있고 `src/app/layout.tsx`에서 `{children}`을 감싸도록 배치됩니다. `Navbar`는 슬라이드 메뉴 상태(`useState`) 때문에 `"use client"` 클라이언트 컴포넌트, `Footer`는 서버 컴포넌트입니다. 전역 색상/폰트(`bg-white font-sans text-[#1a1a1a]`)는 `layout.tsx`의 `<body>` 클래스에 적용되어 있습니다.
- **루트 레이아웃**: `src/app/layout.tsx`에서 `lang="ko"`, 한글 메타데이터, Pretendard 가변 폰트(`next/font/local`로 `node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2` 로드, `--font-pretendard` CSS 변수)를 설정합니다. 페이지 제목/설명은 한국어 마케팅 카피이므로 변경 시 SEO 영향을 고려해야 합니다.
- **스타일링**: Tailwind CSS v4를 `globals.css`의 `@import "tailwindcss"` + `@theme inline` 방식으로 사용합니다(별도 `tailwind.config` 파일 없음). 색상 토큰은 `--background`, `--foreground` CSS 변수로 정의되며, `--font-sans`는 `--font-pretendard`에 매핑되어 있습니다. 페이지 내 강조색은 `#ff4757`(브랜드 레드)이 일관되게 사용됩니다.
- **자산**: 이미지/로고는 `public/images/`에 위치하며 `<img src="/images/...">`로 직접 참조됩니다 (`next/image` 미사용).
- **경로 별칭**: `@/*` → `./src/*` (tsconfig.json).

## 작업 시 주의사항

- **TypeScript 설정이 느슨함**: `tsconfig.json`에서 `strict: false`, `noImplicitAny: false`로 설정되어 있습니다. 빌드 시 타입 오류가 잡히지 않을 수 있으므로 명시적으로 타입을 확인하는 것이 안전합니다.
- **Prettier 규칙**: `printWidth: 150`, `endOfLine: "crlf"`, `singleQuote: false`(큰따옴표), `trailingComma: "all"`, `prettier-plugin-tailwindcss` 사용. Tailwind 클래스 정렬은 플러그인에 맡깁니다.
- **참고용 원본 HTML**: 루트에 `프렌딩스쿨_v1.html` 파일이 있습니다. React로 포팅하기 전의 디자인 원본이므로 디자인/카피 의도를 확인할 때 참고하되 수정 대상은 아닙니다.
