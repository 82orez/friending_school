import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { Calendar } from "lucide-react";
import SuccessBanner from "@/components/SuccessBanner";
import SelfDevelop from "@/components/landing/SelfDevelop";
import { createClient } from "@/utils/supabase/server";
import { ACTIVITIES, COURSE_CARDS, VIDEOS, getYoutubeId, type Video } from "@/data/landing";
import { cn } from "@/lib/utils";

// 섹션 헤더 (그라디언트 라벨 + 제목 + 설명) — 랜딩 전 섹션 공통.
function SectionIntro({ label, title, desc }: { label: string; title: React.ReactNode; desc?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1200px] px-5 pt-12 pb-7 text-center md:px-10">
      <span className="bg-brand-gradient mb-2 inline-block rounded-full px-6 py-1.5 text-base font-bold text-white md:text-xl">{label}</span>
      <h2 className="text-ink mt-1 mb-2.5 text-2xl leading-snug font-bold tracking-tight md:text-[32px]">{title}</h2>
      {desc && <p className="text-muted-fg text-[15px] leading-relaxed md:text-base">{desc}</p>}
    </div>
  );
}

const ACTIVITY_BADGE: Record<string, string> = {
  open: "bg-[#E1F5EE] text-[#0F6E56]",
  plan: "bg-[#E6F1FB] text-[#0C447C]",
  new: "bg-[#EAF3DE] text-[#27500A]",
};

export default async function Home({ searchParams }: { searchParams: Promise<{ reset?: string; verified?: string; signup?: string }> }) {
  const { reset, verified, signup } = await searchParams;

  // 유튜브 영상: admin 등록(노출=true) 우선, 비어있으면 mock VIDEOS로 fallback.
  const supabase = createClient(await cookies());
  const { data: dbVideos } = await supabase
    .from("youtube_videos")
    .select("tag, url, title, description")
    .eq("is_visible", true)
    .order("sort_order", { ascending: true });
  const videos: Video[] = dbVideos && dbVideos.length > 0 ? (dbVideos as Video[]) : VIDEOS;

  // 셀프디벨롭 교재 진행률: 로그인 시 reading_progress 조회 → 카드 완료/진행% 실연동.
  // 연동 course는 SelfDevelop의 LINKED_COURSE와 일치(확장 시 두 곳 함께 갱신).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let completedByCourse: Record<string, Record<number, boolean>> = {};
  if (user) {
    const { data } = await supabase
      .from("reading_progress")
      .select("course, unit, completed")
      .eq("user_id", user.id)
      .in("course", ["workhol", "kitchen", "grammar1", "grammar2", "cosmetic"]);
    if (data) for (const r of data) (completedByCourse[r.course] ??= {})[r.unit] = r.completed;
  }

  return (
    <div className="bg-surface">
      {reset === "success" && <SuccessBanner queryKey="reset" message="비밀번호가 성공적으로 변경되었습니다." />}
      {verified === "success" && <SuccessBanner queryKey="verified" message="이메일 인증이 완료되어 자동으로 로그인되었습니다." />}
      {signup === "success" && <SuccessBanner queryKey="signup" message="프렌딩 스쿨에 오신 것을 환영합니다." />}

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
                    {v.tag && <span className="bg-accent-blue-soft text-accent-blue-ink mb-1.5 inline-block rounded-full px-2 py-0.5 text-sm">{v.tag}</span>}
                    <p className="text-ink mb-1 text-[15px] leading-snug font-medium">{v.title}</p>
                    <p className="text-muted-fg-faint text-sm leading-relaxed">{v.description ?? v.desc}</p>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      </section>

      {/* 4. 실전 스피킹 디벨롭 (과정 카드) */}
      <section id="courses" className="pb-14">
        <div className="mx-auto max-w-[1200px] px-5 md:px-10">
          <div className="rounded-2xl bg-white px-5 py-10 md:px-10 md:py-12">
            <div className="mb-8 text-center">
              <span className="bg-brand-gradient mb-2 inline-block rounded-full px-6 py-1.5 text-base font-bold text-white md:text-xl">
                실전 스피킹 디벨롭
              </span>
              <h2 className="text-ink mt-1 mb-2.5 text-2xl leading-snug font-bold tracking-tight md:text-[32px]">말이 트여야 세계가 열려요.</h2>
              <p className="text-muted-fg text-[15px] md:text-base">원어민과 직접 부딪히며 실력을 키우세요.</p>
            </div>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:grid-cols-3">
              {COURSE_CARDS.map((c) => (
                <div
                  key={c.slug}
                  className="border-rule bg-surface flex flex-col overflow-hidden rounded-2xl border transition-transform hover:-translate-y-0.5">
                  <div className="relative h-[100px]">
                    <Image src={c.image} alt="" fill sizes="(max-width: 768px) 100vw, 400px" className="object-cover" />
                    <div className="absolute inset-0 bg-black/20" />
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <p className="text-ink mb-1.5 text-base font-bold">{c.name}</p>
                    <p className="text-muted-fg mb-2.5 text-[15px] leading-relaxed">{c.desc}</p>
                    <p className="text-ink mt-auto mb-3 text-lg font-bold">
                      {c.price} <span className="text-muted-fg-faint text-xs font-normal">{c.per}</span>
                    </p>
                    <div className="flex gap-2">
                      <Link
                        href={`/courses/${c.slug}`}
                        className="border-rule text-muted-fg hover:border-accent-blue hover:text-accent-blue-ink flex-1 rounded-full border py-2 text-center text-[13px] transition-colors">
                        상세보기
                      </Link>
                      <Link
                        href={`/courses/${c.slug}#apply-form`}
                        className="bg-cta flex-1 rounded-full py-2 text-center text-[13px] font-bold text-white transition-opacity hover:opacity-90">
                        신청하기
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 5. 액티비티 */}
      <section className="pb-14">
        <SectionIntro label="원어민 · 세대교감 액티비티" title="영어는 밖에서도 빨리 늘어요!" desc="국내에서도 많은 활동이 있어요. 함께해요." />
        <div className="mx-auto max-w-[1200px] px-5 md:px-10">
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
            {ACTIVITIES.map((a) => (
              <div key={a.title} className="border-rule overflow-hidden rounded-2xl border bg-white transition-transform hover:-translate-y-0.5">
                <div className="relative h-[110px]">
                  <Image src={a.image} alt="" fill sizes="(max-width: 768px) 100vw, 400px" className="object-cover" />
                  <div className="absolute inset-0 bg-black/30" />
                  <span className={cn("absolute top-2.5 left-2.5 z-[1] rounded-full px-2.5 py-0.5 text-[11px] font-medium", ACTIVITY_BADGE[a.badgeVariant])}>
                    {a.badge}
                  </span>
                </div>
                <div className="p-3.5">
                  <p className="text-ink mb-1.5 text-base font-bold">{a.title}</p>
                  <p className="text-muted-fg mb-3 text-[15px] leading-relaxed">{a.desc}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-fg-faint flex items-center gap-1 text-sm">
                      <Calendar aria-hidden className="size-3.5" /> {a.date}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
