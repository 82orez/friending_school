import type { Metadata } from "next";
import SignupForm from "@/components/auth/SignupForm";

export const metadata: Metadata = {
  title: "회원가입 | 프렌딩 스쿨",
};

export default function SignupPage() {
  return (
    <main className="flex min-h-[calc(100vh-200px)] items-center justify-center bg-[#fafafa] px-6 py-16">
      <SignupForm />
    </main>
  );
}
