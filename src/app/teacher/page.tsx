import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getUserRole } from "@/lib/auth";
import TeacherProfileForm, { type TeacherProfile } from "@/components/teacher/TeacherProfileForm";

export const metadata: Metadata = { title: "Teacher — Friending School", robots: { index: false } };

export default async function TeacherPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/teacher");

  const role = await getUserRole(supabase, user.id);
  if (role !== "teacher" && role !== "admin") redirect("/");

  const { data } = await supabase
    .from("profiles")
    .select("full_name, avatar_url, zoom_url, bio, headline, phone")
    .eq("id", user.id)
    .maybeSingle();

  const profile = (data ?? {}) as Partial<TeacherProfile>;
  const initial: TeacherProfile = {
    full_name: profile.full_name ?? "",
    avatar_url: profile.avatar_url ?? "",
    zoom_url: profile.zoom_url ?? "",
    bio: profile.bio ?? "",
    headline: profile.headline ?? "",
    phone: profile.phone ?? "",
  };

  const displayName = initial.full_name || user.email?.split("@")[0] || "Teacher";

  return (
    <div className="bg-surface min-h-screen">
      {/* 라벨 바 */}
      <div className="px-5 py-7 text-center">
        <span className="bg-brand-gradient inline-block rounded-full px-6 py-1.5 text-base font-bold text-white md:text-xl">TEACHER</span>
      </div>

      <div className="mx-auto max-w-[760px] px-5 pb-16">
        {/* 웰컴 배너 */}
        <div className="bg-brand-gradient mb-5 rounded-2xl px-6 py-7 text-white">
          <p className="text-xs font-bold tracking-[0.1em] opacity-90">FRIENDING SCHOOL · TEACHER</p>
          <p className="mt-2 text-xl font-bold md:text-2xl">Manage your teacher profile, {displayName}. 🎓</p>
          <p className="mt-1 text-sm opacity-90">Adding a profile photo and bio helps build trust with your students.</p>
        </div>

        <TeacherProfileForm userId={user.id} email={user.email ?? ""} initial={initial} />
      </div>
    </div>
  );
}
