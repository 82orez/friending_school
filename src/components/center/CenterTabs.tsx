"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS: { href: string; label: string }[] = [
  { href: "/center", label: "강사 관리" },
  { href: "/center/reassign", label: "강사 대체" },
];

export default function CenterTabs() {
  const pathname = usePathname();
  return (
    <nav className="border-rule mb-5 flex gap-1 border-b" aria-label="센터 관리 메뉴">
      {TABS.map((t) => {
        const active = t.href === "/center" ? pathname === "/center" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "focus-visible:ring-accent-blue/50 -mb-px rounded-t-md border-b-2 px-4 py-2.5 text-sm font-bold transition-colors focus-visible:ring-2 focus-visible:outline-none",
              active ? "border-accent-blue-ink text-accent-blue-ink" : "text-muted-fg hover:text-ink border-transparent",
            )}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
