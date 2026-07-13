import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { requireCenterManager } from "@/lib/center-manager";

export const metadata: Metadata = { title: "센터 관리 — Friending School", robots: { index: false } };

export default async function CenterLayout({ children }: { children: React.ReactNode }) {
  const mgr = await requireCenterManager();
  if (!mgr) redirect("/");

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("first_name, last_name").eq("id", mgr.userId).maybeSingle();
  const displayName = profile ? [profile.last_name, profile.first_name].filter(Boolean).join("") || user?.email?.split("@")[0] : user?.email?.split("@")[0];

  return (
    <div className="bg-surface min-h-screen">
      <div className="px-5 py-7 text-center">
        <span className="bg-brand-gradient inline-block rounded-full px-6 py-1.5 text-base font-bold text-white md:text-xl">CENTER</span>
      </div>

      <div className="mx-auto max-w-[760px] px-5 pb-16">
        <div className="bg-brand-gradient mb-5 rounded-2xl px-6 py-7 text-white">
          <p className="text-xs font-bold tracking-[0.1em] opacity-90">FRIENDING SCHOOL · 센터 매니저</p>
          <p className="mt-2 text-xl font-bold md:text-2xl">안녕하세요, {displayName}님! 👋</p>
          <p className="mt-1 text-sm opacity-90">소속 센터 강사를 조회하고, 수업이 불가한 회차의 강사를 대체할 수 있습니다.</p>
        </div>

        {children}
      </div>
    </div>
  );
}
