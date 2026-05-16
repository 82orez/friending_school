import type { Metadata } from "next";
import LoginForm from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "로그인 | 프렌딩 스쿨",
};

type SearchParams = Promise<{ error?: string; verified?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { error, verified } = await searchParams;
  const showAuthCodeError = error === "auth-code-error";
  const showVerifiedPending = verified === "pending";

  return (
    <main className="flex min-h-[calc(100vh-200px)] items-center justify-center bg-[#fafafa] px-6 py-16">
      <div className="w-full max-w-md">
        {showAuthCodeError && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
            인증 링크가 유효하지 않거나 만료되었습니다. 다시 시도해 주세요.
          </div>
        )}
        {showVerifiedPending && (
          <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700" role="status">
            이메일 인증이 처리되었습니다. 이메일과 비밀번호로 로그인해 주세요.
          </div>
        )}
        <LoginForm />
      </div>
    </main>
  );
}
