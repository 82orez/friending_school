import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getUserRole } from "@/lib/auth";
import TeacherTabs from "@/components/teacher/TeacherTabs";

export const metadata: Metadata = { title: "Teacher — Friending School", robots: { index: false } };

export default async function TeacherDashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/teacher");

  const role = await getUserRole(supabase, user.id);
  if (role !== "teacher" && role !== "admin") redirect("/");

  const { data: profile } = await supabase.from("profiles").select("first_name").eq("id", user.id).maybeSingle();
  // 친근한 호칭은 이름(first) 우선, 없으면 이메일 로컬파트.
  const displayName = profile?.first_name || user.email?.split("@")[0] || "Teacher";

  return (
    <div className="bg-surface min-h-screen">
      <div className="px-5 py-7 text-center">
        <span className="bg-brand-gradient inline-block rounded-full px-6 py-1.5 text-base font-bold text-white md:text-xl">TEACHER</span>
      </div>

      <div className="mx-auto max-w-[760px] px-5 pb-16">
        <div className="bg-brand-gradient mb-5 rounded-2xl px-6 py-7 text-white">
          <p className="text-xs font-bold tracking-[0.1em] opacity-90">FRIENDING SCHOOL · TEACHER</p>
          <p className="mt-2 text-xl font-bold md:text-2xl">Welcome back, {displayName}. 🎓</p>
          <p className="mt-1 text-sm opacity-90">Manage your profile, requests, and classes here.</p>
        </div>

        <TeacherTabs />

        {children}
      </div>
    </div>
  );
}
