import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import ActivitySection from "@/components/landing/ActivitySection";
import SectionIntro from "@/components/landing/SectionIntro";
import SelfDevelop from "@/components/landing/SelfDevelop";
import SpeakingDevelopSection from "@/components/landing/SpeakingDevelopSection";
import { createClient } from "@/utils/supabase/server";
import { isAdmin } from "@/lib/auth";
import { VIDEOS, getYoutubeId, type Video } from "@/data/landing";

// ⚠️ admin 전용 페이지(네비 탭도 isAdmin일 때만 노출) — 색인 금지.
export const metadata: Metadata = { title: "프렌딩 스쿨 소개 — 청년을 세계로", robots: { index: false } };

export default async function SchoolPage() {
  // admin 가드(`/admin` 레이아웃과 동일 패턴). 학생 동선의 "과정 보기"는 /philippines-english가 담당한다.
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/school");
  if (!(await isAdmin(supabase, user.id))) redirect("/");

  // 유튜브 영상: admin 등록(노출=true) 우선, 비어있으면 mock VIDEOS로 fallback.
  const { data: dbVideos } = await supabase
    .from("youtube_videos")
    .select("tag, url, title, description")
    .eq("is_visible", true)
    .order("sort_order", { ascending: true });
  const videos: Video[] = dbVideos && dbVideos.length > 0 ? (dbVideos as Video[]) : VIDEOS;

  // 셀프디벨롭 교재 진행률: reading_progress 조회 → 카드 완료/진행% 실연동.
  // 연동 course는 SelfDevelop의 LINKED_COURSE와 일치(확장 시 두 곳 함께 갱신).
  let completedByCourse: Record<string, Record<number, boolean>> = {};
  const { data } = await supabase
    .from("reading_progress")
    .select("course, unit, completed")
    .eq("user_id", user.id)
    .in("course", ["workhol", "kitchen", "grammar1", "grammar2", "cosmetic"]);
  if (data) for (const r of data) (completedByCourse[r.course] ??= {})[r.unit] = r.completed;

  return (
    <div className="bg-surface">
      {/* 1. 히어로 */}
      <section className="mx-auto max-w-[1200px] bg-[#222]">
        <div className="relative flex min-h-[440px] items-center justify-center overflow-hidden text-center md:min-h-[520px]">
          <Image src="/images/hero-bg.jpg" alt="" fill priority sizes="(max-width: 1200px) 100vw, 1200px" className="object-cover" />
          <div className="absolute inset-0 bg-black/[0.52]" />
          <div className="relative z-10 w-full px-6 py-24 md:px-16 md:py-32">
            <h1 className="mb-4 text-[42px] leading-[1.1] font-bold tracking-[-2px] text-white md:text-[68px]">
              청년을 <span className="text-brand-gradient">세계로</span>
            </h1>
            <p className="mb-3.5 text-xl leading-snug font-medium tracking-tight text-white/90 md:text-[30px]">영어, 이제 세상 밖에서 써보세요.</p>
            <p className="text-base leading-relaxed text-white/70 md:text-lg">워홀·해외진출을 꿈꾸는 청년을 위한 실전 영어 플랫폼.</p>
          </div>
        </div>
      </section>

      {/* 2. 셀프 디벨롭 */}
      <section className="pb-10">
        <SectionIntro
          label="셀프 디벨롭 하기"
          title="현지 영어, 무료로 배워보세요!"
          desc="음성 파일이 포함된 무료 학습 교재, 지금 바로 시작해보세요."
        />
        <SelfDevelop isLoggedIn={!!user} completedByCourse={completedByCourse} />
      </section>

      {/* 3. 호주 현지생존기 (유튜브) */}
      <section className="pb-14">
        <SectionIntro
          label="준의 호주 워홀 일자리 구하기"
          title="호주에서 전달하는 생생한 생존기"
          desc={
            <>
              준이 호주에서 직접 마주친 상황들, 영상으로 함께 확인해보세요.{" "}
              <Link
                href="/youtube"
                className="bg-progress ml-1 inline-block rounded-full px-3 py-1 align-middle text-[13px] font-bold text-white transition-opacity hover:opacity-85">
                전체보기
              </Link>
            </>
          }
        />
        <div className="mx-auto max-w-[1200px] px-5 md:px-10">
          <div className="flex flex-wrap justify-center gap-3.5">
            {videos.map((v, i) => {
              const id = getYoutubeId(v.url);
              return (
                <a
                  key={`${v.url}-${i}`}
                  href={v.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border-rule block w-full shrink-0 overflow-hidden rounded-2xl border bg-white transition-transform hover:-translate-y-0.5 sm:w-[calc(50%-0.4375rem)] md:w-[calc(25%-0.65625rem)]">
                  <div
                    className="relative flex aspect-[9/16] items-center justify-center bg-[#222] bg-cover bg-center"
                    style={id ? { backgroundImage: `url('https://img.youtube.com/vi/${id}/maxresdefault.jpg')` } : undefined}>
                    <div className="flex size-10 items-center justify-center rounded-full border-[1.5px] border-white/50 bg-white/20">
                      <svg viewBox="0 0 24 24" className="ml-0.5 size-4 fill-white" aria-hidden>
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                    {v.duration && (
                      <span className="absolute right-2.5 bottom-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">{v.duration}</span>
                    )}
                  </div>
                  <div className="p-3.5">
                    {v.tag && (
                      <span className="bg-accent-blue-soft text-accent-blue-ink mb-1.5 inline-block rounded-full px-2 py-0.5 text-sm">{v.tag}</span>
                    )}
                    <p className="text-ink mb-1 text-[15px] leading-snug font-medium">{v.title}</p>
                    <p className="text-muted-fg-faint text-sm leading-relaxed">{v.description ?? v.desc}</p>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      </section>

      {/* 4. 실전 스피킹 디벨롭 (과정 카드) — /philippines-english와 공유 컴포넌트 */}
      <SpeakingDevelopSection id="courses" />

      {/* 5. 액티비티 — /activities와 공유 컴포넌트 */}
      <ActivitySection />
    </div>
  );
}
