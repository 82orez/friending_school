This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

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

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Rate limit 관련 중요한 운영 한계 및 고려 사항
* **메모리 기반 저장:** 프로세스 메모리에 카운트가 저장되므로 서버가 재시작되는 경우 수집된 카운트가 초기화됩니다.
* **서버리스(Serverless) 환경 제약:** Vercel 등 인스턴스가 유동적인 서버리스 환경에서는 인스턴스별로 카운트가 분리되어 제한 효과가 낮아질 수 있습니다.
  * *확장 전략:* 향후 트래픽이 급증하거나 Vercel/Cloudflare 배포 환경으로 완전 이전 시, `rateLimit` 함수 내부만 **Upstash Redis**와 같은 외부 분산 메모리 스토어로 교체하면 됩니다. (호출부 인터페이스/시그니처는 동일하게 유지 가능)
* **기존 보안 계층과의 관계:** Supabase 자체 보호 기능(이메일 OTP / 매직 링크 제한 등)이 이미 백엔드 단에서 기본 작동 중이므로, 이번 구현은 서비스 안정성을 높이기 위한 **이중 방어(Defense in Depth)** 역할을 수행합니다.