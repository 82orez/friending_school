"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown, Circle, Lock } from "lucide-react";
import { BOOKS, type Book, type BookUnit } from "@/data/landing";
import { getTextbook } from "@/data/textbook";
import { setUnitCompleted } from "@/app/textbook/actions";
import { cn } from "@/lib/utils";

const TAB_LABELS: Record<string, string> = {
  workhol: "워홀 생존영어",
  kitchen: "셰프 영어",
  basic1: "회화 기초문법 1",
  basic2: "회화 기초문법 2",
  cosmetic: "뷰티 수출영어",
};

// landing book.key → 전자책 course(레지스트리). 여기 등록된 교재만 전자책 연동(나머지는 mock placeholder).
const LINKED_COURSE: Record<string, string> = { workhol: "workhol", kitchen: "kitchen", basic1: "grammar1", basic2: "grammar2", cosmetic: "cosmetic" };

// "Unit 01" → 1, "Unit 25" → 25
function unitNum(u: BookUnit): number {
  return parseInt(u.n.replace(/\D/g, ""), 10);
}

// 전자책 연동 카드: 본문 클릭 시 /textbook/<course>/<unit>(잠금 시 /login?next=).
// 로그인 시 우상단에 수동 완료 토글(Link와 형제로 배치 — 중첩 인터랙티브 방지).
function LinkedUnitCard({
  unit,
  course,
  freeUnits,
  isLoggedIn,
  completed,
  onToggle,
  subtitle,
  situation,
}: {
  unit: BookUnit;
  course: string;
  freeUnits: number[];
  isLoggedIn: boolean;
  completed: boolean;
  onToggle: (num: number, next: boolean) => void;
  subtitle?: string;
  situation?: string;
}) {
  const num = unitNum(unit);
  const locked = !isLoggedIn && !freeUnits.includes(num);
  const href = locked ? `/login?next=/textbook/${course}/${num}` : `/textbook/${course}/${num}`;

  return (
    <div
      className={cn(
        "relative rounded-md border transition-[border-color,background-color,transform,box-shadow] duration-150",
        completed ? "border-progress/40 bg-progress/5" : "border-rule bg-white",
        locked ? "opacity-60" : "hover:border-progress hover:-translate-y-0.5 hover:shadow-md",
      )}>
      <Link
        href={href}
        aria-label={`${unit.n} ${unit.t}${subtitle ? ` — ${subtitle}` : ""}${locked ? " (로그인 필요)" : ""}`}
        className={cn(
          "focus-visible:ring-brand/50 block rounded-md p-4 focus-visible:ring-2 focus-visible:outline-none",
          situation ? "text-left" : "text-center",
        )}>
        <p className={cn("mb-2 text-base font-bold", locked ? "text-muted-fg-faint" : "text-progress")}>{unit.n}</p>
        <p className="text-ink text-[15px] leading-snug font-medium">{unit.t}</p>
        {subtitle && <p className="text-muted-fg-faint mt-1 text-[13px] leading-snug">{subtitle}</p>}
        {situation && <p className="text-muted-fg mt-2 line-clamp-3 text-[13px] leading-relaxed">{situation}</p>}
        {locked && <p className="text-muted-fg-faint mt-2 text-[12px] font-medium">로그인 후 열람</p>}
      </Link>

      {/* 우상단 상태/토글 */}
      {locked ? (
        <Lock aria-label="로그인 필요" className="text-muted-fg-faint absolute top-2.5 right-2.5 size-4" />
      ) : isLoggedIn ? (
        <button
          type="button"
          onClick={() => onToggle(num, !completed)}
          aria-pressed={completed}
          aria-label={completed ? `${unit.n} 학습 완료 취소` : `${unit.n} 학습 완료로 표시`}
          title={completed ? "학습 완료됨 (클릭 시 취소)" : "학습 완료로 표시"}
          className={cn(
            "focus-visible:ring-brand/50 absolute top-2 right-2 inline-flex items-center justify-center rounded-full p-1 transition-colors focus-visible:ring-2 focus-visible:outline-none",
            completed ? "text-progress" : "text-muted-fg-faint hover:text-progress",
          )}>
          {completed ? <CheckCircle2 className="size-5" aria-hidden /> : <Circle className="size-5" aria-hidden />}
        </button>
      ) : (
        <span className="bg-surface text-muted-fg-faint border-rule absolute top-2 right-2 rounded-full border px-1.5 py-0.5 text-[11px] font-bold">
          시작
        </span>
      )}
    </div>
  );
}

function BookPanel({
  book,
  isLoggedIn,
  completedByCourse,
}: {
  book: Book;
  isLoggedIn: boolean;
  completedByCourse: Record<string, Record<number, boolean>>;
}) {
  const [open, setOpen] = useState(false);
  const all = [...book.units, ...book.extra];
  const total = all.length;

  // 모든 BOOKS는 LINKED_COURSE에 등록되어 전자책 연동(book.key→레지스트리 course). 새 교재 추가 시 LINKED_COURSE에도 등록 필수.
  const course = LINKED_COURSE[book.key];
  const textbook = getTextbook(course);
  const freeUnits = textbook?.freeUnits ?? [];

  // 완료 상태를 로컬로 관리(낙관적 토글) — 상단 진행바와 카드가 동일 소스 사용.
  const [completedMap, setCompletedMap] = useState<Record<number, boolean>>(() => ({ ...(completedByCourse[course] ?? {}) }));
  const [, startToggle] = useTransition();

  const handleToggle = (num: number, next: boolean) => {
    setCompletedMap((prev) => ({ ...prev, [num]: next }));
    startToggle(() => {
      setUnitCompleted(course, num, next).catch(() => setCompletedMap((prev) => ({ ...prev, [num]: !next })));
    });
  };

  const done = all.filter((u) => completedMap[unitNum(u)]).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const renderUnit = (u: BookUnit) => {
    const num = unitNum(u);
    const tbUnit = textbook?.units.find((t) => t.unit === num);
    const subtitle = u.sub ?? tbUnit?.titleKr;
    // situation이 부제와 다를 때만 노출(= 사실상 워홀). 나머지 교재는 situation===sub라 undefined.
    const situation = tbUnit?.situation && tbUnit.situation !== subtitle ? tbUnit.situation : undefined;
    return (
      <LinkedUnitCard
        key={u.n}
        unit={u}
        course={course}
        freeUnits={freeUnits}
        isLoggedIn={isLoggedIn}
        completed={!!completedMap[num]}
        onToggle={handleToggle}
        subtitle={subtitle}
        situation={situation}
      />
    );
  };

  return (
    <div className="border-rule mx-auto max-w-[1200px] rounded-2xl border bg-white p-6 md:p-9">
      {/* 교재 소개 */}
      <h3 className="text-ink mb-1 text-xl font-bold tracking-tight md:text-[22px]">
        {book.title} {total}유닛
      </h3>
      <p className="text-muted-fg mb-4 text-sm">{book.copy}</p>
      <div className="mb-5 flex flex-wrap gap-1.5">
        {book.tags.map((tag) => (
          <span
            key={tag.t}
            className={cn(
              "rounded-full px-2.5 py-0.5 text-sm",
              tag.free ? "bg-accent-blue-soft text-accent-blue-ink" : "border-rule text-muted-fg-faint bg-surface border",
            )}>
            {tag.t}
          </span>
        ))}
      </div>

      {/* 진행바 */}
      <div className="mb-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-muted-fg text-[15px]">학습 진행률</span>
          <span className="text-progress text-[15px] font-bold">
            {done} / {total} 완료
          </span>
        </div>
        <div className="bg-rule h-1.5 w-full overflow-hidden rounded-full">
          <div className="bg-progress h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* 기본 유닛 */}
      <div className="mb-2.5 grid grid-cols-2 gap-2.5 md:grid-cols-4">{book.units.map(renderUnit)}</div>

      {/* 확장 유닛 */}
      <div className={cn("grid overflow-hidden transition-[grid-template-rows] duration-300 ease-in-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="min-h-0">
          <div className="mb-2.5 grid grid-cols-2 gap-2.5 md:grid-cols-4">{book.extra.map(renderUnit)}</div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="border-rule text-muted-fg bg-surface hover:border-accent-blue mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border p-3 text-[15px] transition-colors">
        <span>{open ? "접기" : book.exLabel}</span>
        <ChevronDown aria-hidden className={cn("size-4 transition-transform duration-200", open && "rotate-180")} />
      </button>
    </div>
  );
}

export default function SelfDevelop({
  isLoggedIn,
  completedByCourse,
}: {
  isLoggedIn: boolean;
  completedByCourse: Record<string, Record<number, boolean>>;
}) {
  const [curKey, setCurKey] = useState(BOOKS[0].key);
  const book = BOOKS.find((b) => b.key === curKey) ?? BOOKS[0];

  return (
    <>
      {/* 탭 */}
      <div className="mx-auto flex max-w-[1200px] justify-center overflow-hidden px-5 py-4 md:px-10">
        <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {BOOKS.map((b) => {
            const active = b.key === curKey;
            return (
              <button
                key={b.key}
                type="button"
                onClick={() => setCurKey(b.key)}
                className={cn(
                  "shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-all",
                  active
                    ? "bg-brand-gradient border-transparent text-white"
                    : "border-rule text-muted-fg hover:border-accent-blue hover:text-accent-blue-ink bg-white",
                )}>
                {TAB_LABELS[b.key] ?? b.key}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-5 md:px-10">
        <BookPanel key={curKey} book={book} isLoggedIn={isLoggedIn} completedByCourse={completedByCourse} />
      </div>
    </>
  );
}
