"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { BOOKS, type Book, type BookUnit } from "@/data/landing";
import { cn } from "@/lib/utils";

const TAB_LABELS: Record<string, string> = {
  workhol: "워홀 영어",
  kitchen: "주방 영어",
  basic1: "회화기초 문법 1",
  basic2: "회화기초 문법 2",
  cosmetic: "화장품 수출 영어",
};

function UnitCard({ unit }: { unit: BookUnit }) {
  const locked = unit.s === "locked";
  // 유닛 이동은 Phase 3(교재 5종) 이후 연결 — 현재는 placeholder.
  return (
    <div
      className={cn(
        "border-rule relative rounded-md border bg-white p-4 text-center transition-[border-color,transform] duration-150",
        locked ? "opacity-40" : "hover:border-progress cursor-pointer hover:-translate-y-0.5",
      )}>
      {unit.s === "done" && (
        <span className="bg-progress absolute top-2 right-2 rounded-full px-1.5 py-0.5 text-[11px] font-bold text-white">완료</span>
      )}
      {!locked && unit.s !== "done" && (
        <span className="bg-surface text-muted-fg-faint border-rule absolute top-2 right-2 rounded-full border px-1.5 py-0.5 text-[11px] font-bold">
          시작
        </span>
      )}
      <p className={cn("mb-2 text-base font-bold", locked ? "text-muted-fg-faint" : "text-progress")}>{unit.n}</p>
      <p className="text-ink text-[15px] leading-snug font-medium">{unit.t}</p>
      {unit.sub && <p className="text-muted-fg-faint mt-1 text-[13px] leading-snug">{unit.sub}</p>}
    </div>
  );
}

function BookPanel({ book }: { book: Book }) {
  const [open, setOpen] = useState(false);
  const all = [...book.units, ...book.extra];
  const total = all.length;
  const done = all.filter((u) => u.s === "done").length;
  const pct = Math.round((done / total) * 100);

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
      <div className="mb-2.5 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {book.units.map((u) => (
          <UnitCard key={u.n} unit={u} />
        ))}
      </div>

      {/* 확장 유닛 */}
      <div className={cn("grid overflow-hidden transition-[grid-template-rows] duration-300 ease-in-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="min-h-0">
          <div className="mb-2.5 grid grid-cols-2 gap-2.5 md:grid-cols-4">
            {book.extra.map((u) => (
              <UnitCard key={u.n} unit={u} />
            ))}
          </div>
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

export default function SelfDevelop() {
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
        <BookPanel key={curKey} book={book} />
      </div>
    </>
  );
}
