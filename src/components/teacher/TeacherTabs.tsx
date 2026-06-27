"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS: { href: string; label: string }[] = [
  { href: "/teacher", label: "Profile" },
  { href: "/teacher/requests", label: "Enrollment Requests" },
  { href: "/teacher/classroom", label: "My Classroom" },
];

export default function TeacherTabs() {
  const pathname = usePathname();
  return (
    <nav className="border-rule mb-5 flex gap-1 border-b" aria-label="Teacher menu">
      {TABS.map((t) => {
        const active = t.href === "/teacher" ? pathname === "/teacher" : pathname.startsWith(t.href);
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
