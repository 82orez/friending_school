import type { Metadata } from "next";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";
import AuthBannerSlot from "@/components/auth/AuthBannerSlot";

export const metadata: Metadata = {
  title: "비밀번호 찾기 | 프렌딩 스쿨",
};

type SearchParams = Promise<{ error?: string }>;

export default async function ForgotPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const { error } = await searchParams;
  const showLinkExpired = error === "link-expired";

  return (
    <main className="flex min-h-[calc(100vh-200px)] items-center justify-center bg-[#fafafa] px-6 py-16">
      <div className="w-full max-w-md">
        <AuthBannerSlot>
          {showLinkExpired && (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
              비밀번호 재설정 링크가 유효하지 않거나 만료되었습니다. 아래에서 새 링크를 요청해 주세요.
            </div>
          )}
        </AuthBannerSlot>
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
