import Image from "next/image";
import Link from "next/link";
import { CoursePriceLine } from "@/components/CoursePrice";
import { COURSE_CARDS } from "@/data/landing";
import { cn } from "@/lib/utils";

// 실전 스피킹 디벨롭 — 과정 카드 5종. /school(id="courses")과 /philippines-english에서 공유.
// 과정 목록으로 보내는 링크(EnrollWizard·StudentEnrollments)는 이제 /philippines-english를 가리킨다.
export default function SpeakingDevelopSection({ id, className }: { id?: string; className?: string }) {
  return (
    <section id={id} className={cn("pb-14", className)}>
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
                  <CoursePriceLine className="mt-auto mb-3" />
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
  );
}
