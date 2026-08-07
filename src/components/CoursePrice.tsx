import { cn } from "@/lib/utils";
import { COURSE_DISCOUNT_LABEL, COURSE_LIST_PRICE_LABEL, COURSE_PER_LABEL, COURSE_PRICE_LABEL, HAS_COURSE_DISCOUNT } from "@/data/pricing";

// 수강료 할인 표시 — 랜딩 과정 카드·과정 상세 공용(server component, 클라 JS 없음).
// 할인이 없으면(HAS_COURSE_DISCOUNT=false) 배지가 사라지고 가격도 기존 한 줄 표시로 자동 복귀한다.

/**
 * 가격 블록 — `정가(취소선) → [할인 배지 / 할인가 / 24회]`.
 * 배지는 **할인가 바로 위**에 오도록, 정가·화살표를 왼쪽 열로 빼고 배지+할인가를 오른쪽 열로 묶는다
 * (배지를 블록 최상단에 두면 가장 왼쪽인 정가 위로 붙어 버림).
 */
export function CoursePriceLine({ size = "sm", className }: { size?: "sm" | "lg"; className?: string }) {
  const priceSize = size === "lg" ? "text-2xl" : "text-lg";
  const subSize = size === "lg" ? "text-base" : "text-xs";
  const badgeSize = size === "lg" ? "px-2.5 py-1 text-sm" : "px-2 py-0.5 text-xs";
  return (
    <div className={cn("flex flex-wrap items-end gap-x-1.5", className)}>
      {HAS_COURSE_DISCOUNT && (
        <>
          <span className="sr-only">정가</span>
          <s className={cn("text-muted-fg-faint pb-0.5 font-normal", subSize)}>{COURSE_LIST_PRICE_LABEL}</s>
          <span aria-hidden className={cn("text-muted-fg-faint pb-0.5 font-normal", subSize)}>
            →
          </span>
        </>
      )}
      <span className="flex flex-col items-start gap-1">
        {HAS_COURSE_DISCOUNT && (
          <>
            <span className={cn("bg-brand rounded-md font-bold text-white shadow-sm", badgeSize)}>{COURSE_DISCOUNT_LABEL}</span>
            <span className="sr-only">할인가</span>
          </>
        )}
        <span className={cn("text-ink flex items-baseline gap-x-1.5 font-bold tracking-tight", priceSize)}>
          {COURSE_PRICE_LABEL}
          <span className={cn("text-muted-fg-faint font-normal", subSize)}>{COURSE_PER_LABEL}</span>
        </span>
      </span>
    </div>
  );
}
