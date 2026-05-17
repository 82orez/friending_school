import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";
import AuthBannerSlot from "@/components/auth/AuthBannerSlot";
import { createClient } from "@/utils/supabase/server";

export const metadata: Metadata = {
  title: "비밀번호 찾기 | 프렌딩 스쿨",
};

type SearchParams = Promise<{ error?: string }>;

export default async function ForgotPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/");
  }

  const { error } = await searchParams;
  const showLinkExpired = error === "link-expired";

  return (
    <main className="flex min-h-[calc(100vh-200px)] items-center justify-center bg-[#fafafa] px-6 py-16">
      <div className="w-full max-w-md">
        <AuthBannerSlot>
          {showLinkExpired && (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
              <p>비밀번호 재설정 링크가 유효하지 않거나 만료되었습니다.</p>
              <p className="mt-1.5 text-xs text-destructive/80">
                아래에서 새 링크를 요청하시거나, 비밀번호를 기억하셨다면{" "}
                <Link href="/login" className="font-semibold underline hover:no-underline">
                  로그인
                </Link>
                해 주세요.
              </p>
            </div>
          )}
        </AuthBannerSlot>
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
