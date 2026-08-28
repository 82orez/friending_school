// 섹션 헤더 (그라디언트 라벨 + 제목 + 설명) — 랜딩 전 섹션 공통.
export default function SectionIntro({ label, title, desc }: { label: string; title: React.ReactNode; desc?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1200px] px-5 pt-12 pb-7 text-center md:px-10">
      <span className="bg-brand-gradient mb-2 inline-block rounded-full px-6 py-1.5 text-base font-bold text-white md:text-xl">{label}</span>
      <h2 className="text-ink mt-1 mb-2.5 text-2xl leading-snug font-bold tracking-tight md:text-[32px]">{title}</h2>
      {desc && <p className="text-muted-fg text-[15px] leading-relaxed md:text-base">{desc}</p>}
    </div>
  );
}
