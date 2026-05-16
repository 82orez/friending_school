import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

export const metadata: Metadata = {
  title: "비밀번호 재설정 | 프렌딩 스쿨",
};

export default async function ResetPasswordPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/forgot-password");
  }

  return (
    <main className="flex min-h-[calc(100vh-200px)] items-center justify-center bg-[#fafafa] px-6 py-16">
      <ResetPasswordForm />
    </main>
  );
}
