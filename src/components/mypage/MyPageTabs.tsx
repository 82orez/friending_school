"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS: { href: string; label: string }[] = [
  { href: "/mypage", label: "기본 정보" },
  { href: "/mypage/enrollments", label: "수강신청 내역" },
  { href: "/mypage/classroom", label: "내 강의실" },
  { href: "/mypage/rooms", label: "프렌딩 예약" },
];

export default function MyPageTabs() {
  const pathname = usePathname();
  return (
    <nav className="border-rule mb-5 flex gap-1 border-b" aria-label="마이페이지 메뉴">
      {TABS.map((t) => {
        const active = t.href === "/mypage" ? pathname === "/mypage" : pathname.startsWith(t.href);
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
