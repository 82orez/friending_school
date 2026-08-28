import type { Metadata } from "next";
import SpeakingDevelopSection from "@/components/landing/SpeakingDevelopSection";
import { PHILIPPINES_HERO } from "@/data/philippines-english";

export const metadata: Metadata = { title: "필리핀 화상영어 — 프렌딩 스쿨" };

// 필리핀 화상영어 안내 페이지. 히어로 문구는 src/data/philippines-english.ts,
// 과정 카드는 /school 4번 섹션과 동일한 SpeakingDevelopSection(공유)을 재사용한다.
export default function PhilippinesEnglishPage() {
  const { label, title, lead, points } = PHILIPPINES_HERO;

  return (
    <div className="bg-surface">
      {/* 히어로 */}
      <section className="mx-auto max-w-[1200px] px-5 pt-12 pb-8 text-center md:px-10 md:pt-16 md:pb-10">
        <span className="bg-brand-gradient mb-2 inline-block rounded-full px-6 py-1.5 text-base font-bold text-white md:text-xl">{label}</span>
        <h1 className="text-ink mt-1 mb-3 text-[26px] leading-snug font-bold tracking-tight md:text-[40px]">{title}</h1>
        <p className="text-muted-fg mx-auto max-w-[620px] text-[15px] leading-relaxed md:text-base">{lead}</p>

        <ul className="mt-6 flex list-none flex-wrap justify-center gap-2">
          {points.map((p) => (
            <li key={p} className="border-rule bg-accent-blue-soft text-accent-blue-ink rounded-full border px-4 py-1.5 text-sm font-semibold">
              {p}
            </li>
          ))}
        </ul>
      </section>

      {/* 과정 카드 — /school#courses와 동일 컴포넌트(앵커 id는 /school 전용이라 넘기지 않는다) */}
      <SpeakingDevelopSection />
    </div>
  );
}
