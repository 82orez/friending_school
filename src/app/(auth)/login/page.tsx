import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import LoginForm from "@/components/auth/LoginForm";
import AuthBannerSlot from "@/components/auth/AuthBannerSlot";
import { createClient } from "@/utils/supabase/server";
import { safeNextPath } from "@/lib/url";

export const metadata: Metadata = {
  title: "로그인 | 프렌딩 스쿨",
};

type SearchParams = Promise<{ error?: string; verified?: string; next?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { error, verified, next: rawNext } = await searchParams;
  // 로그인 후 돌아갈 경로(예: /login?next=/friending). open redirect 방지 검증 필수.
  const next = safeNextPath(rawNext);

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 이미 로그인된 상태로 들어와도 원래 가려던 곳으로 보낸다.
  if (user) {
    redirect(next);
  }
  const showAuthCodeError = error === "auth-code-error";
  const showVerifiedPending = verified === "pending";

  return (
    <main className="flex min-h-[calc(100vh-200px)] items-center justify-center bg-[#fafafa] px-6 py-16">
      <div className="w-full max-w-md">
        <AuthBannerSlot>
          {showAuthCodeError && (
            <div className="border-destructive/30 bg-destructive/10 text-destructive mb-4 rounded-md border px-4 py-3 text-sm" role="alert">
              <p>인증 링크가 유효하지 않거나 만료되었습니다.</p>
              <p className="text-destructive/80 mt-1.5 text-xs">
                아래에서 로그인을 시도하시거나, 계정이 없으시면{" "}
                <Link href="/signup" className="font-semibold underline hover:no-underline">
                  회원가입
                </Link>
                해 주세요.
              </p>
            </div>
          )}
          {showVerifiedPending && (
            <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700" role="status">
              이메일 인증이 처리되었습니다. 이메일과 비밀번호로 로그인해 주세요.
            </div>
          )}
        </AuthBannerSlot>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
