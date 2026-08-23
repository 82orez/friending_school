import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Fragment } from "react";
import { PREP_SESSION_COUNT } from "@/data/prep";
import { PREP_PAGE } from "@/data/prep-page";
import { formatWon } from "@/lib/prep";
import PrepHeroArt from "@/components/prep/PrepHeroArt";

export const metadata: Metadata = { title: "프렙 강좌 — 프렌딩 스쿨" };

// 프렙 공개 소개 페이지. 문구는 전부 src/data/prep-page.ts에서 온다.
// ⚠️ DB를 읽지 않는 **정적 홍보 페이지**다 — prep_courses는 아직 공개 RLS 정책이 없고,
//    실제 개설 강좌 목록은 수강신청 동선과 함께 붙인다(docs/prep.md).
export default function PrepPage() {
  const { hero, specs, audienceHead, audience, flowHead, flow, curriculum, curriculumNote, teacher, price, faq } = PREP_PAGE;

  return (
    <div className="bg-surface">
      {/* 히어로 */}
      <section className="mx-auto max-w-[1200px] px-5 pt-7 pb-2 md:px-10">
        <div className="relative isolate flex min-h-[380px] items-center overflow-hidden rounded-2xl bg-[#1b2450] md:min-h-[440px]">
          <PrepHeroArt className="absolute inset-0 -z-10 h-full w-full" />
          <div className="absolute inset-0 -z-10 bg-black/45" />

          <div className="w-full px-6 py-12 text-center md:px-14 md:py-16">
            {/* 문구가 길어 모바일에서 줄바꿈될 수 있다 — 알약 모양이 깨지지 않게 max-w + leading-snug. */}
            <span className="bg-brand-gradient inline-block max-w-full rounded-full px-5 py-2 text-[13px] leading-snug font-bold text-white md:px-6 md:text-base">
              {hero.label}
            </span>
            <h1 className="mt-4 text-[26px] leading-snug font-bold tracking-tight whitespace-pre-line text-white md:text-[44px]">{hero.title}</h1>
            <p className="mx-auto mt-4 max-w-[620px] text-base leading-relaxed text-white/85 md:text-lg">{hero.lead}</p>

            {/* 핵심 스펙 칩 */}
            <ul className="mt-7 flex list-none flex-wrap justify-center gap-2">
              {specs.map((s) => (
                <li
                  key={s.key}
                  className="rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-sm font-medium text-white backdrop-blur-[2px]">
                  <span className="text-white/60">{s.key}</span> <span className="font-bold">{s.value}</span>
                </li>
              ))}
            </ul>

            {/* ⚠️ 수강신청 동선이 아직 없다 — 열리는 순간 이 버튼만 Link로 바꾸면 된다. */}
            <button
              type="button"
              disabled
              className="mt-8 inline-block rounded-full bg-white/20 px-8 py-3.5 text-base font-bold tracking-wide text-white/70 disabled:cursor-not-allowed">
              {hero.ctaDisabled}
            </button>
          </div>
        </div>
      </section>

      {/* 이런 분께 */}
      <section className="py-16 md:py-18">
        <div className="mx-auto max-w-[1200px] px-5 md:px-10">
          <h2 className="text-ink mb-12 text-center text-2xl leading-snug font-bold tracking-tight md:text-[32px]">
            {audienceHead.lead}
            <em className="text-brand-gradient not-italic">{audienceHead.em}</em>
            {audienceHead.tail}
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {audience.map((a) => (
              <div key={a.title} className="border-rule border-l-accent-blue rounded-2xl border border-l-4 bg-white p-7">
                <h3 className="text-ink mb-3 text-lg leading-snug font-bold">{a.title}</h3>
                <p className="text-muted-fg text-base leading-relaxed">{a.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 이렇게 진행됩니다 */}
      <section className="pb-16 md:pb-18">
        <div className="bg-ink mx-auto max-w-[1200px] rounded-2xl px-5 py-12 md:px-16 md:py-16">
          <h2 className="mb-10 text-center text-2xl leading-snug font-bold tracking-tight text-white md:text-[32px]">
            {flowHead.lead}
            <em className="text-brand-gradient not-italic">{flowHead.em}</em>
          </h2>
          <ol className="mx-auto grid max-w-[900px] list-none grid-cols-1 gap-7 md:grid-cols-2">
            {flow.map((f, i) => (
              <li key={f.title} className="flex gap-4">
                <span className="text-brand-gradient w-10 shrink-0 text-[36px] leading-none font-bold md:w-[52px] md:text-[40px]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <h3 className="mb-1.5 text-lg leading-snug font-bold text-white">{f.title}</h3>
                  <p className="text-base leading-relaxed text-[#aaa]">{f.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 커리큘럼 예시 */}
      <section className="bg-white py-16 md:py-18">
        <div className="mx-auto max-w-[1200px] px-5 md:px-10">
          <div className="mb-8 text-center">
            <span className="bg-accent-blue-soft text-accent-blue-ink inline-block rounded-full px-3.5 py-1 text-sm font-bold">커리큘럼 예시</span>
            <h2 className="text-ink mt-3 text-2xl leading-snug font-bold tracking-tight md:text-[32px]">
              한 달, <em className="text-brand-gradient not-italic">{PREP_SESSION_COUNT}개의 주제</em>
            </h2>
            <p className="text-muted-fg mt-3 text-base">{curriculumNote}</p>
          </div>
          <ol className="grid list-none grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-4">
            {curriculum.map((topic, i) => (
              <li
                key={topic}
                className="border-rule bg-surface hover:border-accent-blue rounded-md border p-5 transition-[border-color,transform] duration-150 hover:-translate-y-0.5">
                <p className="text-accent-blue-ink mb-1.5 text-sm font-bold">{i + 1}강</p>
                <p className="text-ink text-base leading-snug font-medium">{topic}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 강사 + 수강료 */}
      <section className="py-16 md:py-18">
        <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-4 px-5 md:grid-cols-2 md:px-10">
          <div className="border-rule rounded-2xl border bg-white p-7 md:p-8">
            <span className="bg-accent-blue-soft text-accent-blue-ink mb-5 inline-block rounded-full px-3.5 py-1 text-sm font-bold">
              {teacher.role}
            </span>
            <div className="flex items-center gap-5">
              {/* 원형 아바타 — 앱 공통 규칙대로 relative 래퍼가 크기를 잡고 Image는 fill + object-cover.
                  ⚠️ 사진 배경이 흰색이라 흰 카드 위에서는 원의 경계가 사라져 얼굴이 한쪽으로 쏠려 보인다 → ring으로 테두리를 준다. */}
              <div className="ring-rule relative size-24 shrink-0 overflow-hidden rounded-full ring-1 md:size-28">
                <Image src={teacher.photo} alt={`${teacher.name} 강사`} fill sizes="112px" className="object-cover" />
              </div>
              <div className="min-w-0">
                <p className="text-ink text-xl font-bold">
                  {teacher.name} <span className="text-muted-fg text-base font-medium">({teacher.englishName})</span>
                </p>
                <p className="text-muted-fg mt-1 text-base">{teacher.desc}</p>
              </div>
            </div>

            {/* 이력 — 카드 아래 남던 빈 공간을 채운다. */}
            <ul className="border-rule mt-6 list-none space-y-2.5 border-t pt-5">
              {teacher.credentials.map((c) => (
                <li key={c} className="flex items-start gap-2.5">
                  <span aria-hidden className="bg-accent-blue mt-2 size-1.5 shrink-0 rounded-full" />
                  <span className="text-ink text-base font-medium">{c}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-rule rounded-2xl border bg-white p-7 md:p-8">
            <span className="bg-accent-blue-soft text-accent-blue-ink mb-5 inline-block rounded-full px-3.5 py-1 text-sm font-bold">수강료</span>
            {/* ⚠️ CoursePriceLine은 전역 21만원 상수 전용이라 여기서는 쓰지 않는다. */}
            <p className="text-ink text-[34px] leading-none font-bold tracking-tight md:text-[40px]">{formatWon(price.krw)}</p>
            <p className="text-muted-fg mt-3 text-base">
              {price.note} · <span className="text-ink font-bold">{price.perLabel}</span>
            </p>
            <ul className="text-muted-fg mt-5 list-none space-y-2 text-base">
              {specs.slice(0, 3).map((s) => (
                <li key={s.key} className="flex gap-2.5">
                  <span className="text-muted-fg-faint w-11 shrink-0">{s.key}</span>
                  <span className="text-ink font-medium">{s.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="pb-16 md:pb-18">
        <div className="mx-auto max-w-[880px] px-5">
          <h2 className="text-ink mb-8 text-center text-2xl leading-snug font-bold tracking-tight md:text-[32px]">자주 묻는 질문</h2>
          <div className="border-rule overflow-hidden rounded-2xl border bg-white">
            {faq.map((f, i) => (
              <Fragment key={f.q}>
                {i > 0 && <div className="border-rule border-t" />}
                <details className="group px-6 py-5">
                  <summary className="text-ink cursor-default text-base font-bold">{f.q}</summary>
                  <p className="text-muted-fg mt-3 text-base leading-relaxed">{f.a}</p>
                </details>
              </Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* 마무리 CTA */}
      <section className="pb-16 md:pb-18">
        <div className="mx-auto max-w-[1200px] px-5 md:px-10">
          <div className="rounded-2xl bg-[#E05A6A] px-5 py-12 text-center md:px-10 md:py-16">
            <h2 className="mb-4 text-[22px] leading-snug font-bold tracking-tight text-white md:text-[28px]">내일 아침 6시, 같이 시작해요</h2>
            <p className="mb-8 text-base text-white/85">수강 신청은 곧 열립니다. 먼저 무료 연습방에서 분위기를 확인해 보세요.</p>
            <button
              type="button"
              disabled
              className="text-ink inline-block rounded-full bg-white/70 px-8 py-3.5 text-base font-bold tracking-wide disabled:cursor-not-allowed">
              {hero.ctaDisabled}
            </button>
            <p className="mt-5 text-sm text-white/85">
              <Link href="/friending" className="font-bold text-white underline underline-offset-4 hover:opacity-90">
                무료 연습방 둘러보기
              </Link>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
