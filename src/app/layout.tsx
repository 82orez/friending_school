import type { Metadata } from "next";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AuthHashHandler from "@/components/auth/AuthHashHandler";
import { Toaster } from "@/components/ui/sonner";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { createClient } from "@/utils/supabase/server";
import { getUserRole } from "@/lib/auth";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

const pretendard = localFont({
  src: "../../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  display: "swap",
  weight: "45 920",
  variable: "--font-pretendard",
});

export const metadata: Metadata = {
  title: "프렌딩 스쿨 - 해외 진출 챌린지 캠프",
  description: "청년을 세계로, 프렌딩 스쿨. 매일 50분 워홀 필수 생존 영어 말하기.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const role = user ? await getUserRole(supabase, user.id) : null;
  const admin = role === "admin";
  const teacher = role === "teacher";
  // 센터 매니저 여부 — centers.manager_id에 본인이 지정됐는지(공개 select라 세션 클라로 조회 가능).
  let centerManager = false;
  if (user) {
    const { count } = await supabase.from("centers").select("id", { count: "exact", head: true }).eq("manager_id", user.id);
    centerManager = (count ?? 0) > 0;
  }

  return (
    <html lang="ko" data-scroll-behavior="smooth" className={cn("font-sans", geist.variable)}>
      <body className={`${pretendard.variable} bg-white font-sans text-[#1a1a1a] antialiased`}>
        <Navbar user={user ? { email: user.email } : null} isAdmin={admin} isTeacher={teacher} isCenterManager={centerManager} />
        <AuthHashHandler />
        {children}
        <Footer />
        <Toaster />
      </body>
    </html>
  );
}
