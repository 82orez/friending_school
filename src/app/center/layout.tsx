import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { requireCenterManager } from "@/lib/center-manager";
import CenterTabs from "@/components/center/CenterTabs";
import { LangProvider } from "@/components/LangProvider";

export const metadata: Metadata = { title: "Center Management — Friending School", robots: { index: false } };

export default async function CenterLayout({ children }: { children: React.ReactNode }) {
  const mgr = await requireCenterManager();
  if (!mgr) redirect("/");

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("first_name, last_name").eq("id", mgr.userId).maybeSingle();
  // 원어민 강사/매니저 위주라 영문 이름 순서(first last), 없으면 이메일 앞부분.
  const displayName = profile ? [profile.first_name, profile.last_name].filter(Boolean).join(" ") || user?.email?.split("@")[0] : user?.email?.split("@")[0];

  return (
    <div className="bg-surface min-h-screen">
      <div className="px-5 py-7 text-center">
        <span className="bg-brand-gradient inline-block rounded-full px-6 py-1.5 text-base font-bold text-white md:text-xl">CENTER</span>
      </div>

      <div className="mx-auto max-w-[760px] px-5 pb-16">
        <div className="bg-brand-gradient mb-5 rounded-2xl px-6 py-7 text-white">
          <p className="text-xs font-bold tracking-[0.1em] opacity-90">FRIENDING SCHOOL · CENTER MANAGER</p>
          <p className="mt-2 text-xl font-bold md:text-2xl">Welcome, {displayName}! 👋</p>
          <p className="mt-1 text-sm opacity-90">View your center&apos;s teachers and reassign a session&apos;s teacher when a class can&apos;t be held.</p>
        </div>

        <CenterTabs />

        <LangProvider lang="en">{children}</LangProvider>
      </div>
    </div>
  );
}
