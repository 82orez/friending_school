"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS: { href: string; label: string }[] = [
  { href: "/admin/enrollments", label: "📚 수강신청" },
  { href: "/admin/classes", label: "📹 화상수업" },
  { href: "/admin/members", label: "👥 회원 관리" },
  { href: "/admin/teacher-requests", label: "🧑‍🏫 강사 관리" },
  { href: "/admin/friender-requests", label: "🤝 프렌더 관리" },
  { href: "/admin/prep", label: "📘 프렙 강좌" },
  { href: "/admin/centers", label: "🏫 센터 관리" },
  { href: "/admin/revenue", label: "📈 매출 현황" },
  { href: "/admin/profit", label: "📊 매출이익" },
  { href: "/admin/simulation", label: "🎯 목표 시뮬레이션" },
  { href: "/admin/settlements", label: "💰 강사 정산" },
  { href: "/admin/youtube", label: "🎬 유튜브 관리" },
  { href: "/admin/notices", label: "📢 공지 사항" },
];

const FOCUS = "focus-visible:ring-accent-blue/50 focus-visible:ring-2 focus-visible:outline-none";

export default function AdminNav() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname.startsWith(href);

  return (
    <>
      {/* 모바일: 가로 스크롤 pill */}
      <nav aria-label="관리자 메뉴" className="flex [scrollbar-width:none] gap-2 overflow-x-auto md:hidden [&::-webkit-scrollbar]:hidden">
        {ITEMS.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-full border px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                FOCUS,
                active ? "bg-ink border-ink text-white" : "border-rule text-muted-fg hover:border-accent-blue hover:text-accent-blue-ink bg-white",
              )}>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* 데스크톱: 좌측 세로 사이드바 */}
      <nav aria-label="관리자 메뉴" className="border-rule sticky top-[72px] hidden self-start rounded-xl border bg-white p-2 md:block">
        {ITEMS.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "block rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                FOCUS,
                active ? "bg-ink text-white" : "text-muted-fg hover:bg-accent-blue-soft hover:text-accent-blue-ink",
              )}>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
