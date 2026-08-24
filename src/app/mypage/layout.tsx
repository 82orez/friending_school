import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { todayKst } from "@/lib/booking";
import { loadTodayPrepSessions } from "@/lib/prep-session";
import MyPageTabs from "@/components/mypage/MyPageTabs";
import TodayPrepBanner, { type TodayPrepBannerItem } from "@/components/prep/TodayPrepBanner";

export const metadata: Metadata = { title: "마이페이지 — 프렌딩 스쿨" };

export default async function MyPageLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/mypage");

  const { data: profile } = await supabase.from("profiles").select("first_name, last_name").eq("id", user.id).maybeSingle();
  // 한국 관례: 성+이름 붙임(홍+길동=홍길동).
  const fullName = `${profile?.last_name ?? ""}${profile?.first_name ?? ""}`.trim();
  const displayName = fullName || user.email?.split("@")[0] || "회원";

  // 오늘 프렙 수업 — 수강생(수강확정)·개설 프렌더(승인) 양쪽. 어느 탭에 있든 보이도록 layout이 담당한다.
  // ⚠️ service_role 조회라 회차가 없으면 배너를 아예 렌더하지 않는다(빈 자리를 남기지 않기 위해).
  const todayRows = await loadTodayPrepSessions(user.id, todayKst());
  const todaySessions: TodayPrepBannerItem[] = todayRows.map((s) => ({
    id: s.id,
    courseTitle: s.courseTitle,
    sessionNo: s.sessionNo,
    total: s.total,
    topic: s.topic,
    startMin: s.startMin,
    durationMin: s.durationMin,
    startMs: s.startMs,
    endMs: s.endMs,
    isHost: s.isHost,
  }));

  return (
    <div className="bg-surface min-h-screen">
      <div className="px-5 py-7 text-center">
        <span className="bg-brand-gradient inline-block rounded-full px-6 py-1.5 text-base font-bold text-white md:text-xl">MY PAGE</span>
      </div>

      <div className="mx-auto max-w-[760px] px-5 pb-16">
        <div className="bg-brand-gradient mb-5 rounded-2xl px-6 py-7 text-white">
          <p className="text-xs font-bold tracking-[0.1em] opacity-90">FRIENDING SCHOOL+</p>
          <p className="mt-2 text-xl font-bold md:text-2xl">안녕하세요, {displayName}님! 👋</p>
          <p className="mt-1 text-sm opacity-90">프렌딩 스쿨과 함께해 주셔서 감사합니다.</p>
        </div>

        {todaySessions.length > 0 && <TodayPrepBanner sessions={todaySessions} />}

        <MyPageTabs />

        {children}
      </div>
    </div>
  );
}
