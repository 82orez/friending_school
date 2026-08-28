import Image from "next/image";
import { Calendar } from "lucide-react";
import SectionIntro from "@/components/landing/SectionIntro";
import { ACTIVITIES } from "@/data/landing";
import { cn } from "@/lib/utils";

const ACTIVITY_BADGE: Record<string, string> = {
  open: "bg-[#E1F5EE] text-[#0F6E56]",
  plan: "bg-[#E6F1FB] text-[#0C447C]",
  new: "bg-[#EAF3DE] text-[#27500A]",
};

// 원어민 · 세대교감 액티비티 — /school 5번 섹션과 /activities에서 공유. 카드 데이터는 landing.ts의 ACTIVITIES 단일 소스.
export default function ActivitySection({ id, className }: { id?: string; className?: string }) {
  return (
    <section id={id} className={cn("pb-14", className)}>
      <SectionIntro label="원어민 · 세대교감 액티비티" title="영어는 밖에서도 빨리 늘어요!" desc="국내에서도 많은 활동이 있어요. 함께해요." />
      <div className="mx-auto max-w-[1200px] px-5 md:px-10">
        <div className="flex flex-col gap-3.5 md:flex-row md:flex-wrap md:justify-center">
          {ACTIVITIES.map((a) => (
            <div
              key={a.title}
              className="border-rule w-full overflow-hidden rounded-2xl border bg-white transition-transform hover:-translate-y-0.5 md:w-[364px]">
              <div className="relative h-[110px]">
                <Image src={a.image} alt="" fill sizes="(max-width: 768px) 100vw, 400px" className="object-cover" />
                <div className="absolute inset-0 bg-black/30" />
                <span
                  className={cn(
                    "absolute top-2.5 left-2.5 z-[1] rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                    ACTIVITY_BADGE[a.badgeVariant],
                  )}>
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
  );
}
