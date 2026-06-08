import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import CourseApplyForm from "@/components/course/CourseApplyForm";
import { COURSE_SLUGS, NOTICE_STEPS, getCourse, getCurriculumGroups } from "@/data/courses";

export function generateStaticParams() {
  return COURSE_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const course = getCourse(slug);
  return { title: course ? `${course.title} — 프렌딩 스쿨` : "과정 — 프렌딩 스쿨" };
}

export default async function CoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const course = getCourse(slug);
  if (!course) notFound();

  const curriculumGroups = getCurriculumGroups(course);

  return (
    <div className="bg-surface">
      {/* 1. 페이지 구분 라벨 */}
      <div className="px-5 py-7 text-center">
        <span className="bg-brand-gradient inline-block rounded-full px-6 py-1.5 text-base font-bold text-white md:text-xl">실전 스피킹 디벨롭</span>
      </div>

      {/* 2. 과정 대표 이미지 */}
      <div className="mx-auto max-w-[1200px] px-5 pb-5 md:px-0">
        <div className="relative flex h-[200px] items-center justify-center overflow-hidden rounded-2xl bg-[#1a1a1a] md:h-[250px]">
          <Image src={course.heroImage} alt="" fill priority sizes="(max-width: 1200px) 100vw, 1200px" className="object-cover" />
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 px-6 text-center">
            <h1 className="text-2xl leading-snug font-bold tracking-tight text-white md:text-[40px]">{course.title}</h1>
            <p className="mt-2.5 text-base font-normal text-white/85 md:text-lg">{course.tagline}</p>
          </div>
        </div>
      </div>

      {/* 3. 상단 3단 카드 */}
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-4 px-5 py-7 md:grid-cols-3 md:px-0">
        {/* 간략소개 */}
        <div className="border-rule rounded-2xl border bg-white p-7 md:p-8">
          <span className="bg-accent-blue-soft text-accent-blue-ink mb-4 inline-block rounded-full px-3.5 py-1 text-sm font-bold">과정 소개</span>
          <p className="text-ink mb-3 text-xl leading-snug font-bold tracking-tight">{course.introTitle}</p>
          <p className="text-muted-fg text-base leading-relaxed">
            {course.introDesc.map((line, i) => (
              <span key={i}>
                {line}
                {i < course.introDesc.length - 1 && <br />}
              </span>
            ))}
          </p>
        </div>

        {/* 과정 개요 + 가격 + 신청 버튼 */}
        <div className="border-rule rounded-2xl border bg-white p-7 md:p-8">
          <span className="bg-accent-blue-soft text-accent-blue-ink mb-4 inline-block rounded-full px-3.5 py-1 text-sm font-bold">과정 개요</span>
          <ul className="mb-5 flex flex-col gap-2.5">
            {course.spec.map((s) => (
              <li key={s.key} className="flex items-start gap-2.5 text-base">
                <span className="text-muted-fg-faint w-11 shrink-0">{s.key}</span>
                <span className="text-ink font-medium">{s.val}</span>
              </li>
            ))}
          </ul>
          <p className="text-ink mb-4 text-2xl font-bold tracking-tight">
            {course.price} <span className="text-muted-fg-faint text-base font-normal">{course.per}</span>
          </p>
          <a
            href="#apply-form"
            className="bg-brand-gradient block w-full rounded-full py-3.5 text-center text-base font-bold tracking-wide text-white transition-opacity hover:opacity-90">
            상담 신청하기
          </a>
        </div>

        {/* 신청 안내 */}
        <div className="border-rule rounded-2xl border bg-white p-7 md:p-8">
          <span className="bg-accent-blue-soft text-accent-blue-ink mb-4 inline-block rounded-full px-3.5 py-1 text-sm font-bold">신청 안내</span>
          <div className="flex flex-col gap-4">
            {NOTICE_STEPS.map((n) => (
              <div key={n.step} className="flex flex-col gap-1">
                <span className="text-accent-blue-ink text-[13px] font-bold tracking-wide">{n.step}</span>
                <p className="text-muted-fg text-base leading-relaxed whitespace-pre-line">
                  {n.text}
                  {n.link && (
                    <>
                      <br />
                      <a href={n.link.href} target="_blank" rel="noopener noreferrer" className="text-accent-blue-ink underline">
                        {n.link.label}
                      </a>
                    </>
                  )}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4. 후회 3가지 */}
      <section className="py-16 md:py-18">
        <div className="mx-auto max-w-[1200px] px-5 md:px-10">
          <h2 className="text-ink mb-12 text-center text-2xl leading-snug font-bold tracking-tight md:text-[32px]">
            {course.regretHeadLead}
            <br />
            <em className="text-brand-gradient not-italic">{course.regretHeadEm}</em>
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {course.regret.map((r) => (
              <div key={r.num} className="border-rule border-progress rounded-2xl border border-l-4 bg-white p-7">
                <p className="text-progress mb-2.5 text-[13px] font-bold tracking-wide">{r.num}</p>
                <p className="text-ink mb-3 text-lg leading-snug font-bold">{r.title}</p>
                <p className="text-muted-fg text-base leading-relaxed">{r.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. 이렇게 달라요 (다크 박스) */}
      <section className="py-16 md:py-18">
        <div className="bg-ink mx-auto max-w-[1200px] rounded-2xl px-5 py-12 md:px-16 md:py-16">
          <h2 className="mb-12 text-center text-2xl leading-snug font-bold tracking-tight text-white md:text-[32px]">
            {course.diffHeadLead}
            <em className="text-brand-gradient not-italic">{course.diffHeadEm}</em>
          </h2>
          <div className="flex flex-col gap-8">
            {course.diff.map((d, i) => (
              <div key={i} className="flex items-start gap-5 md:gap-6">
                <span className="text-brand-gradient w-10 shrink-0 text-[40px] leading-none font-bold md:w-[52px]">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <p className="mb-2 text-lg leading-snug font-bold text-white">{d.title}</p>
                  <p className="text-base leading-relaxed text-[#aaa]">{d.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. 후기 */}
      <section className="py-16 md:py-18">
        <div className="mx-auto max-w-[1200px] px-5 md:px-10">
          <h2 className="text-ink mb-12 text-center text-2xl leading-snug font-bold tracking-tight md:text-[32px]">
            {course.reviewHeadLead}
            <em className="text-brand-gradient not-italic">{course.reviewHeadEm}</em>
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {course.reviews.map((r, i) => (
              <div key={i} className="border-rule rounded-2xl border bg-white p-7">
                <p role="img" aria-label="별점 5점 만점에 5점" className="mb-3.5 text-base tracking-[2px] text-[#F5A623]">
                  ★ ★ ★ ★ ★
                </p>
                <p className="text-muted-fg mb-4 text-base leading-[1.8]">{r.text}</p>
                <p className="text-ink text-base font-bold">{r.author}</p>
                <p className="text-muted-fg-faint mt-0.5 text-sm">{r.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. 커리큘럼 */}
      <section className="bg-white py-16 md:py-18">
        <div className="mx-auto max-w-[1200px] px-5 md:px-10">
          <h2 className="text-ink mb-12 text-center text-2xl leading-snug font-bold tracking-tight md:text-[32px]">커리큘럼</h2>
          {curriculumGroups.map((group, gi) => (
            <div key={gi} className={gi > 0 ? "mt-10" : undefined}>
              {group.title && (
                <p className="border-progress text-ink mb-4 inline-block border-b-2 pb-2.5 text-lg font-bold">{group.title}</p>
              )}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-4">
                {group.units.map((u) => (
                  <div
                    key={u.n}
                    className="border-rule bg-surface hover:border-progress rounded-md border p-5 text-center transition-[border-color,transform] duration-150 hover:-translate-y-0.5">
                    <p className="text-progress mb-2 text-base font-bold">{u.n.replace(/^Unit 0?/, "Unit ")}</p>
                    <p className="text-ink text-base leading-snug font-medium">{u.t}</p>
                    {u.sub && <p className="text-muted-fg-faint mt-1 text-sm leading-snug">{u.sub}</p>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 8. 신청폼 */}
      <section id="apply-form" className="py-16 md:py-18">
        <div className="mx-auto max-w-[1200px] rounded-2xl bg-[#E05A6A] px-5 py-12 md:px-10 md:py-16">
          <h2 className="mb-9 text-center text-[22px] leading-snug font-bold tracking-tight text-white md:text-[28px]">
            {course.applyHeading.map((line, i) => (
              <span key={i}>
                {line}
                {i < course.applyHeading.length - 1 && <br />}
              </span>
            ))}
          </h2>
          <CourseApplyForm courseSlug={course.slug} title={course.applyTitle} options={course.applyOptions} />
        </div>
      </section>
    </div>
  );
}
