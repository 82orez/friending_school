import { cn } from "@/lib/utils";
import { COURSE_DISCOUNT_LABEL, COURSE_LIST_PRICE_LABEL, COURSE_PER_LABEL, COURSE_PRICE_LABEL, HAS_COURSE_DISCOUNT } from "@/data/pricing";

// 수강료 할인 표시 — 랜딩 과정 카드·과정 상세 공용(server component, 클라 JS 없음).
// 할인이 없으면(HAS_COURSE_DISCOUNT=false) 리본은 렌더되지 않고 가격도 기존 한 줄 표시로 자동 복귀한다.

/** 이미지 우상단 할인 리본 — 부모가 `relative`여야 한다(랜딩 카드 썸네일·과정 상세 히어로). */
export function DiscountRibbon({ size = "sm", className }: { size?: "sm" | "lg"; className?: string }) {
  if (!HAS_COURSE_DISCOUNT) return null;
  return (
    <span
      className={cn(
        "bg-brand absolute z-10 rounded-md font-bold text-white shadow-sm",
        size === "lg" ? "top-4 right-4 px-3.5 py-1.5 text-sm md:text-base" : "top-2 right-2 px-2.5 py-1 text-xs",
        className,
      )}
    >
      {COURSE_DISCOUNT_LABEL}
    </span>
  );
}

/** 가격 한 줄 — 할인 시 `정가(취소선) → 할인가 / 24회`, 할인이 없으면 `가격 / 24회`. */
export function CoursePriceLine({ size = "sm", className }: { size?: "sm" | "lg"; className?: string }) {
  const priceSize = size === "lg" ? "text-2xl" : "text-lg";
  const subSize = size === "lg" ? "text-base" : "text-xs";
  return (
    <p className={cn("text-ink flex flex-wrap items-baseline gap-x-1.5 font-bold tracking-tight", priceSize, className)}>
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
  );
}
