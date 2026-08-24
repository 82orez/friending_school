"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/lib/phone";

export type AdminMember = {
  id: string;
  email: string;
  created_at: string;
  role: string;
  email_confirmed: boolean;
  last_name: string | null;
  first_name: string | null;
  english_name: string | null;
  phone: string | null;
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
  friender: "bg-cta/10 text-cta",
  friender_plus: "bg-cta text-white",
  student: "bg-rule text-muted-fg",
};

// role 원문 대신 표시용 라벨(미등재 role은 원문 그대로).
const ROLE_LABEL: Record<string, string> = {
  friender_plus: "friender plus",
};

type SortKey = "seq" | "last_name" | "first_name" | "english_name" | "email" | "phone" | "role" | "created_at";

// 정렬 비교값(전부 문자열). seq·가입일은 자릿수 맞춤/ISO라 문자열 비교로도 순서가 맞는다.
const SORT_VALUE: Record<SortKey, (m: MemberRow) => string> = {
  seq: (m) => String(m.seq).padStart(8, "0"),
  last_name: (m) => m.last_name ?? "",
  first_name: (m) => m.first_name ?? "",
  english_name: (m) => m.english_name ?? "",
  email: (m) => m.email,
  phone: (m) => (m.phone ?? "").replace(/\D/g, ""),
  role: (m) => ROLE_LABEL[m.role] ?? m.role,
  created_at: (m) => m.created_at,
};

type MemberRow = AdminMember & { seq: number };

export default function MembersManager({ members }: { members: AdminMember[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);

  const toggleSort = (key: SortKey) =>
    setSort((prev) => (prev?.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  // 가입순 번호는 정렬·검색과 무관하게 고정(members는 가입일 desc로 들어옴).
  const rows: MemberRow[] = useMemo(() => members.map((m, i) => ({ ...m, seq: members.length - i })), [members]);

  const thisMonth = useMemo(() => {
    const now = new Date();
    return members.filter((m) => {
      const d = new Date(m.created_at);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
  }, [members]);

  // 이메일 외 이름·영어이름·전화번호도 검색 대상(전화는 숫자만 비교 → 하이픈 입력 무관).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    const base = !q
      ? rows
      : rows.filter((m) => {
          const haystack = [m.email, m.last_name, m.first_name, `${m.last_name ?? ""}${m.first_name ?? ""}`, m.english_name]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (haystack.includes(q)) return true;
          return !!qDigits && !!m.phone && m.phone.replace(/\D/g, "").includes(qDigits);
        });
    if (!sort) return base;
    // 빈 값은 방향과 무관하게 항상 뒤로.
    const val = (m: MemberRow) => SORT_VALUE[sort.key](m).trim();
    return [...base].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      const cmp = av.localeCompare(bv, "ko");
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [rows, query, sort]);

  return (
    <div>
      <h1 className="text-ink text-2xl font-extrabold">회원 관리</h1>
      <p className="text-muted-fg mt-1 text-sm">
        가입 회원 목록입니다. 강사 권한은 「강사 관리」, 프렌더 권한은 「프렌더 관리」 탭에서 승인/회수합니다.
      </p>

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
          placeholder="이메일·이름·영어 이름·전화번호 검색..."
          className="h-10 flex-1 bg-transparent text-sm outline-none"
        />
      </div>

      <div className="border-rule mt-4 overflow-hidden rounded-xl border bg-white">
        {filtered.length === 0 ? (
          <p className="text-muted-fg px-6 py-12 text-center text-sm">표시할 회원이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="border-rule bg-surface text-muted-fg-faint border-b text-left text-xs font-semibold">
                  <SortHeader label="#" sortKey="seq" sort={sort} onSort={toggleSort} className="w-20 px-4 py-2.5 text-center md:px-6" />
                  <SortHeader label="성" sortKey="last_name" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
                  <SortHeader label="이름" sortKey="first_name" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
                  <SortHeader label="영어 이름" sortKey="english_name" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
                  <SortHeader label="이메일" sortKey="email" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
                  <SortHeader label="전화번호" sortKey="phone" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
                  <SortHeader label="권한" sortKey="role" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
                  <SortHeader label="가입일" sortKey="created_at" sort={sort} onSort={toggleSort} className="px-4 py-2.5 text-right md:px-6" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id} className="border-rule border-b last:border-b-0">
                    <td className="text-muted-fg-faint px-4 py-3.5 text-center align-middle text-xs md:px-6">{m.seq}</td>
                    <td className="text-ink px-4 py-3.5 align-middle text-sm font-semibold whitespace-nowrap">
                      {m.last_name || <span className="text-muted-fg-faint font-normal">-</span>}
                    </td>
                    <td className="text-ink px-4 py-3.5 align-middle text-sm font-semibold whitespace-nowrap">
                      {m.first_name || <span className="text-muted-fg-faint font-normal">-</span>}
                    </td>
                    <td className="text-muted-fg px-4 py-3.5 align-middle text-sm whitespace-nowrap">
                      {m.english_name || <span className="text-muted-fg-faint">-</span>}
                    </td>
                    <td className="text-ink px-4 py-3.5 align-middle text-sm">
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 truncate">{m.email}</span>
                        {!m.email_confirmed && (
                          <span className="bg-brand/10 text-brand shrink-0 rounded-full px-2 py-0.5 text-xs font-bold">미인증</span>
                        )}
                      </span>
                    </td>
                    <td className="text-muted-fg px-4 py-3.5 align-middle text-sm whitespace-nowrap">
                      {m.phone ? formatPhone(m.phone) : <span className="text-muted-fg-faint">-</span>}
                    </td>
                    <td className="px-4 py-3.5 align-middle">
                      <span
                        className={cn(
                          "inline-block rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap",
                          ROLE_BADGE[m.role] ?? ROLE_BADGE.student,
                        )}>
                        {ROLE_LABEL[m.role] ?? m.role}
                      </span>
                    </td>
                    <td className="text-muted-fg-faint px-4 py-3.5 text-right align-middle text-xs whitespace-nowrap md:px-6">
                      {formatDate(m.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// 클릭 시 asc→desc 토글. 다른 admin 매니저(EnrollmentsManager 등)와 동일한 헤더 UI.
function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" } | null;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort?.key === sortKey;
  const Icon = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th className={className} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(sortKey)} className="hover:text-ink inline-flex items-center gap-1 font-semibold transition-colors">
        {label}
        <Icon aria-hidden className={cn("size-3.5", active ? "text-ink" : "text-muted-fg-faint/60")} />
      </button>
    </th>
  );
}
