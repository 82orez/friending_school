"프렌딩 스쿨" 워홀 영어 교육 과정 랜딩 페이지 + 전자책(교재) 뷰어입니다. [Next.js](https://nextjs.org) App Router 기반이며 [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app)으로 부트스트랩되었습니다.

## 기술 스택

- **Next.js 16** (App Router, Turbopack dev/build) + **React 19.2**
- **Tailwind CSS v4** + shadcn/ui (`base-nova` 스타일, `neutral` baseColor)
- **Supabase** SSR 인증(이메일/비밀번호 + 카카오 OAuth) · Postgres + RLS
- 폰트: Pretendard(`next/font/local`) + [Geist](https://vercel.com/font)(`next/font/google`)

> 참고: Next.js 16에서 라우팅 전 미들웨어 컨벤션이 `middleware` → `proxy`로 리네임되었습니다. 세션 갱신 로직은 `src/proxy.ts`(`export async function proxy`)에 있습니다.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `src/app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load fonts (Pretendard for Korean body text, [Geist](https://vercel.com/font) for Latin).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Rate limit 관련 중요한 운영 한계 및 고려 사항

- **메모리 기반 저장:** 프로세스 메모리에 카운트가 저장되므로 서버가 재시작되는 경우 수집된 카운트가 초기화됩니다.
- **서버리스(Serverless) 환경 제약:** Vercel 등 인스턴스가 유동적인 서버리스 환경에서는 인스턴스별로 카운트가 분리되어 제한 효과가 낮아질 수 있습니다.
  - _확장 전략:_ 향후 트래픽이 급증하거나 Vercel/Cloudflare 배포 환경으로 완전 이전 시, `rateLimit` 함수 내부만 **Upstash Redis**와 같은 외부 분산 메모리 스토어로 교체하면 됩니다. (호출부 인터페이스/시그니처는 동일하게 유지 가능)
- **기존 보안 계층과의 관계:** Supabase 자체 보호 기능(이메일 OTP / 매직 링크 제한 등)이 이미 백엔드 단에서 기본 작동 중이므로, 이번 구현은 서비스 안정성을 높이기 위한 **이중 방어(Defense in Depth)** 역할을 수행합니다.

## 추후 해결 과제

- 로그인 된 상태에서는 로그인 페이지 접근 불가하기
- Bot/spam 방지 부재
  - CAPTCHA, 허니팟 필드 없음. 마케팅 사이트라 회원가입이 공개되어 있으므로 봇이 대량 가입할 수 있음. Cloudflare
    Turnstile, hCaptcha 등 검토.
- emailExists 페이지네이션 — 사용자 수 증가 시 비효율
  - listUsers를 페이지당 1000명씩 최대 50페이지(5만 명)까지 순회. 사용자 수가 많아지면 매 로그인/비밀번호 찾기마다 풀
    스캔이 발생. 향후 auth.users를 조회하는 Postgres RPC 함수(SECURITY DEFINER)로 교체 권장.
