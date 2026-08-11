import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getUserRole } from "@/lib/auth";

export const metadata: Metadata = { title: "프렌더 — 프렌딩 스쿨", robots: { index: false } };

// route group (dashboard) — /friender/apply는 이 그룹 밖이라 이 레이아웃에 감싸이지 않는다(강사와 동일 구조).
export default async function FrienderDashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/friender");

  const role = await getUserRole(supabase, user.id);
  if (role !== "friender" && role !== "admin") redirect("/");

  const { data: profile } = await supabase.from("profiles").select("first_name, last_name").eq("id", user.id).maybeSingle();
  // 한국 관례상 성+이름을 공백 없이 붙임. 이름이 없으면 이메일 로컬파트.
  const displayName = `${profile?.last_name ?? ""}${profile?.first_name ?? ""}` || user.email?.split("@")[0] || "프렌더";

  return (
    <div className="bg-surface min-h-screen">
      <div className="px-5 py-7 text-center">
        <span className="bg-brand-gradient inline-block rounded-full px-6 py-1.5 text-base font-bold text-white md:text-xl">프렌더</span>
      </div>

      <div className="mx-auto max-w-[760px] px-5 pb-16">
        <div className="bg-brand-gradient mb-5 rounded-2xl px-6 py-7 text-white">
          <p className="text-xs font-bold tracking-[0.1em] opacity-90">FRIENDING SCHOOL · FRIENDER</p>
          <p className="mt-2 text-xl font-bold md:text-2xl">{displayName}님, 환영합니다 🤝</p>
          <p className="mt-1 text-sm opacity-90">회원들에게 보여질 프로필을 관리하세요.</p>
        </div>

        {children}
      </div>
    </div>
  );
}
