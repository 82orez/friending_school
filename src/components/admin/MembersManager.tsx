"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type AdminMember = {
  id: string;
  email: string;
  created_at: string;
  role: string;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

const ROLE_BADGE: Record<string, string> = {
  admin: "bg-brand/10 text-brand",
  teacher: "bg-accent-blue-soft text-accent-blue-ink",
  student: "bg-rule text-muted-fg",
};

export default function MembersManager({ members }: { members: AdminMember[] }) {
  const [query, setQuery] = useState("");

  const thisMonth = useMemo(() => {
    const now = new Date();
    return members.filter((m) => {
      const d = new Date(m.created_at);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
  }, [members]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.email.toLowerCase().includes(q));
  }, [members, query]);

  return (
    <div>
      <h1 className="text-ink text-2xl font-extrabold">회원 관리</h1>
      <p className="text-muted-fg mt-1 text-sm">가입 회원 목록입니다. 강사 권한은 「강사 관리」 탭에서 승인/회수합니다.</p>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="border-rule rounded-xl border bg-white p-5">
          <p className="text-muted-fg-faint text-xs font-semibold">전체 회원</p>
          <p className="text-ink mt-1 text-2xl font-extrabold">{members.length}</p>
          <p className="text-muted-fg-faint mt-0.5 text-xs">누적 전체</p>
        </div>
        <div className="border-rule rounded-xl border bg-white p-5">
          <p className="text-muted-fg-faint text-xs font-semibold">이번달 가입</p>
          <p className="text-ink mt-1 text-2xl font-extrabold">{thisMonth}</p>
          <p className="text-muted-fg-faint mt-0.5 text-xs">이번 달</p>
        </div>
      </div>

      <div className="border-rule mt-5 flex items-center gap-2 rounded-lg border bg-white px-3">
        <Search className="text-muted-fg-faint size-4" aria-hidden />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이메일 검색..."
          className="h-10 flex-1 bg-transparent text-sm outline-none"
        />
      </div>

      <div className="border-rule mt-4 overflow-hidden rounded-xl border bg-white">
        {filtered.length === 0 ? (
          <p className="text-muted-fg px-6 py-12 text-center text-sm">표시할 회원이 없습니다.</p>
        ) : (
          <ul className="list-none">
            {filtered.map((m, i) => (
              <li key={m.id} className="border-rule flex items-center gap-3 border-b px-4 py-3.5 last:border-b-0 md:px-6">
                <span className="text-muted-fg-faint w-7 shrink-0 text-center text-xs">{filtered.length - i}</span>
                <span className="text-ink min-w-0 flex-1 truncate text-sm font-medium">{m.email}</span>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-bold", ROLE_BADGE[m.role] ?? ROLE_BADGE.student)}>{m.role}</span>
                <span className="text-muted-fg-faint shrink-0 text-xs">{formatDate(m.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
