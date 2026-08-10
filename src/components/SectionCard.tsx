import * as React from "react";

import { cn } from "@/lib/utils";

type SectionCardVariant = "accent-left" | "outline" | "plain";

const variantClasses: Record<SectionCardVariant, string> = {
  "accent-left": "border-l-[6px] border-brand bg-surface",
  outline: "border border-rule bg-surface",
  plain: "bg-surface",
};

export function SectionCard({ variant = "outline", className, ...props }: React.ComponentProps<"div"> & { variant?: SectionCardVariant }) {
  return <div className={cn(variantClasses[variant], className)} {...props} />;
}
