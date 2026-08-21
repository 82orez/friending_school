"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// TeacherTabs/MyPageTabs와 동일 구조(라벨만 한국어 — 프렌더 UI는 전부 한국어).
const TABS: { href: string; label: string }[] = [
  { href: "/friender", label: "프로필" },
  { href: "/friender/rooms", label: "방 관리" },
  { href: "/friender/reviews", label: "받은 후기" },
];

export default function FrienderTabs() {
  const pathname = usePathname();
  return (
    <nav className="border-rule mb-5 flex gap-1 border-b" aria-label="프렌더 메뉴">
      {TABS.map((t) => {
        const active = t.href === "/friender" ? pathname === "/friender" : pathname.startsWith(t.href);
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
