"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

// 별점 표시/입력 공용. onChange가 없으면 읽기 전용(장식)으로 렌더한다.
// 색은 과정 상세 후기 블록에서 이미 쓰는 #F5A623 — 대응 토큰이 없어 예외로 인정된 hex다.
const STAR_COLOR = "#F5A623";
const SCORES = [1, 2, 3, 4, 5];

export default function StarRating({
  value,
  onChange,
  size = "md",
  className,
}: {
  value: number;
  onChange?: (score: number) => void;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const starClass = size === "lg" ? "size-8" : size === "sm" ? "size-3.5" : "size-5";

  if (!onChange) {
    return (
      <span role="img" aria-label={`5점 만점에 ${value}점`} className={cn("inline-flex items-center gap-0.5", className)}>
        {SCORES.map((s) => (
          <Star
            key={s}
            aria-hidden
            className={cn(starClass, "shrink-0")}
            style={{ color: STAR_COLOR, fill: s <= value ? STAR_COLOR : "transparent" }}
          />
        ))}
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {SCORES.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          aria-label={`${s}점`}
          aria-pressed={s === value}
          className="focus-visible:ring-accent-blue/50 rounded transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:outline-none">
          <Star aria-hidden className={starClass} style={{ color: STAR_COLOR, fill: s <= value ? STAR_COLOR : "transparent" }} />
        </button>
      ))}
    </span>
  );
}
