import * as React from "react";

import { cn } from "@/lib/utils";

type SectionCardVariant = "accent-left" | "outline" | "plain";

const variantClasses: Record<SectionCardVariant, string> = {
  "accent-left": "border-l-[6px] border-[#ff4757] bg-[#f8f8f8]",
  outline: "border border-[#e8e8e8] bg-[#f8f8f8]",
  plain: "bg-[#f8f8f8]",
};

export function SectionCard({
  variant = "outline",
  className,
  ...props
}: React.ComponentProps<"div"> & { variant?: SectionCardVariant }) {
  return <div className={cn(variantClasses[variant], className)} {...props} />;
}
