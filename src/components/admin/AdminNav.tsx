"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/admin/enrollments", label: "📚 수강신청" },
  { href: "/admin/classes", label: "📹 화상수업" },
  { href: "/admin/members", label: "👥 회원 관리" },
  { href: "/admin/teacher-requests", label: "🧑‍🏫 강사 관리" },
  { href: "/admin/centers", label: "🏫 센터 관리" },
  { href: "/admin/revenue", label: "📈 매출 현황" },
  { href: "/admin/settlements", label: "💰 정산" },
  { href: "/admin/youtube", label: "🎬 유튜브 관리" },
];

export default function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex [scrollbar-width:none] gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden">
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full border px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors",
              active ? "bg-ink border-ink text-white" : "border-rule text-muted-fg hover:border-accent-blue hover:text-accent-blue-ink bg-white",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
