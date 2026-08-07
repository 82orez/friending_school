import { cn } from "@/lib/utils";
import { COURSE_DISCOUNT_LABEL, COURSE_LIST_PRICE_LABEL, COURSE_PER_LABEL, COURSE_PRICE_LABEL, HAS_COURSE_DISCOUNT } from "@/data/pricing";

// 수강료 할인 표시 — 랜딩 과정 카드·과정 상세 공용(server component, 클라 JS 없음).
// 할인이 없으면(HAS_COURSE_DISCOUNT=false) 배지가 사라지고 가격도 기존 한 줄 표시로 자동 복귀한다.

/** 가격 블록 — 할인 배지(가격 바로 위) + `정가(취소선) → 할인가 / 24회` 한 줄. */
export function CoursePriceLine({ size = "sm", className }: { size?: "sm" | "lg"; className?: string }) {
  const priceSize = size === "lg" ? "text-2xl" : "text-lg";
  const subSize = size === "lg" ? "text-base" : "text-xs";
  const badgeSize = size === "lg" ? "px-2.5 py-1 text-sm" : "px-2 py-0.5 text-xs";
  return (
    <div className={cn("flex flex-col items-start gap-1.5", className)}>
      {HAS_COURSE_DISCOUNT && <span className={cn("bg-brand rounded-md font-bold text-white shadow-sm", badgeSize)}>{COURSE_DISCOUNT_LABEL}</span>}
      <p className={cn("text-ink flex flex-wrap items-baseline gap-x-1.5 font-bold tracking-tight", priceSize)}>
        {HAS_COURSE_DISCOUNT && (
          <>
            <span className="sr-only">정가</span>
            <s className={cn("text-muted-fg-faint font-normal", subSize)}>{COURSE_LIST_PRICE_LABEL}</s>
            <span aria-hidden className={cn("text-muted-fg-faint font-normal", subSize)}>
              →
            </span>
            <span className="sr-only">할인가</span>
          </>
        )}
        <span>{COURSE_PRICE_LABEL}</span>
        <span className={cn("text-muted-fg-faint font-normal", subSize)}>{COURSE_PER_LABEL}</span>
      </p>
    </div>
  );
}
