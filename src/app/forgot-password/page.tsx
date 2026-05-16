import type { Metadata } from "next";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = {
  title: "비밀번호 찾기 | 프렌딩 스쿨",
};

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-[calc(100vh-200px)] items-center justify-center bg-[#fafafa] px-6 py-16">
      <ForgotPasswordForm />
    </main>
  );
}
