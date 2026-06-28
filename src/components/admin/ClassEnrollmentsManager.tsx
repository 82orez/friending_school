"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAX_CANCELLATIONS } from "@/lib/classtime";

export type ClassEnrollmentSummary = {
  enrollmentId: string;
  course: string;
  courseTitle: string;
  studentName: string | null;
  studentEnglishName: string | null;
  teacherName: string | null;
  total: number;
  upcoming: number;
  done: number;
  cancelled: number;
  makeup: number;
  firstDate: string;
  lastDate: string;
};

type FilterKey = "전체" | "진행중" | "완료";
const FILTERS: FilterKey[] = ["전체", "진행중", "완료"];
const isOngoing = (r: ClassEnrollmentSummary) => r.upcoming > 0;

type SortKey = "course" | "student" | "teacher" | "start";

const SORT_VALUE: Record<SortKey, (r: ClassEnrollmentSummary) => string> = {
  course: (r) => r.courseTitle,
  student: (r) => r.studentName ?? "",
  teacher: (r) => r.teacherName ?? "",
  start: (r) => r.firstDate,
};

export default function ClassEnrollmentsManager({ rows }: { rows: ClassEnrollmentSummary[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("전체");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);

  const toggleSort = (key: SortKey) => setSort((prev) => (prev?.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const counts = useMemo(() => {
    const c = { 전체: rows.length, 진행중: 0, 완료: 0 };
    for (const r of rows) (isOngoing(r) ? (c.진행중 += 1) : (c.완료 += 1));
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = rows.filter((r) => {
      if (filter === "진행중" && !isOngoing(r)) return false;
      if (filter === "완료" && isOngoing(r)) return false;
      if (!q) return true;
      return `${r.studentName ?? ""} ${r.studentEnglishName ?? ""} ${r.teacherName ?? ""} ${r.courseTitle}`.toLowerCase().includes(q);
    });
    if (!sort) return base;
    const val = (r: ClassEnrollmentSummary) => SORT_VALUE[sort.key](r).trim();
    return [...base].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      const cmp = av.localeCompare(bv, "ko");
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [rows, query, filter, sort]);

  const open = (id: string) => router.push(`/admin/classes/${id}`);

  return (
    <div>
      <h1 className="text-ink text-2xl font-extrabold">화상수업 관리</h1>
      <p className="text-muted-fg mt-1 text-sm">수강신청으로 생성된 과정 목록입니다. 행을 클릭하면 해당 과정의 수업을 관리할 수 있습니다.</p>

      <div className="mt-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = filter === f;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={active}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                active ? "bg-ink border-ink text-white" : "border-rule text-muted-fg hover:border-accent-blue hover:text-accent-blue-ink bg-white",
              )}
            >
              {f} <span className={cn("ml-0.5", active ? "text-white/70" : "text-muted-fg-faint")}>{counts[f] ?? 0}</span>
            </button>
          );
        })}
      </div>

      <div className="border-rule mt-4 flex items-center gap-2 rounded-lg border bg-white px-3">
        <Search className="text-muted-fg-faint size-4" aria-hidden />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="학생·강사·과정 검색..."
          className="h-10 flex-1 bg-transparent text-sm outline-none"
        />
      </div>

      <div className="border-rule mt-4 overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-rule bg-surface text-muted-fg-faint border-b text-left text-xs font-semibold">
              <th className="px-4 py-2.5 md:px-6">상태</th>
              <SortHeader label="과정" sortKey="course" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
              <SortHeader label="학생" sortKey="student" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
              <SortHeader label="강사" sortKey="teacher" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
              <SortHeader label="기간" sortKey="start" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
              <th className="px-4 py-2.5">진행</th>
              <th className="px-4 py-2.5 md:px-6">남은 취소</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-muted-fg px-6 py-12 text-center text-sm">
                  표시할 과정이 없습니다.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const ongoing = isOngoing(r);
                const active = r.total - r.cancelled;
                const pct = active > 0 ? Math.round((r.done / active) * 100) : 0;
                const remaining = Math.max(0, MAX_CANCELLATIONS - r.cancelled);
                return (
                  <tr
                    key={r.enrollmentId}
                    onClick={() => open(r.enrollmentId)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        open(r.enrollmentId);
                      }
                    }}
                    tabIndex={0}
                    className="border-rule hover:bg-surface/60 focus-visible:bg-surface/60 cursor-pointer border-b transition-colors outline-none last:border-b-0"
                  >
                    <td className="px-4 py-3.5 align-middle md:px-6">
                      <div className="flex flex-col items-start gap-1.5">
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold",
                            ongoing ? "bg-accent-blue-soft text-accent-blue-ink" : "bg-rule text-muted-fg",
                          )}
                        >
                          {ongoing ? "진행중" : "완료"}
                        </span>
                        {r.makeup > 0 && <span className="bg-progress/10 text-progress shrink-0 rounded-full px-2 py-0.5 text-xs font-bold">보강 {r.makeup}</span>}
                      </div>
                    </td>
                    <td className="text-ink max-w-[12rem] truncate px-4 py-3.5 align-middle font-bold">{r.courseTitle}</td>
                    <td className="text-ink max-w-[10rem] truncate px-4 py-3.5 align-middle">
                      {r.studentName ?? "학생"}
                      {r.studentEnglishName && <span className="text-muted-fg-faint"> ({r.studentEnglishName})</span>}
                    </td>
                    <td className="text-muted-fg max-w-[10rem] truncate px-4 py-3.5 align-middle">{r.teacherName ?? "강사"}</td>
                    <td className="text-muted-fg px-4 py-3.5 align-middle whitespace-nowrap">
                      {r.firstDate}
                      <span className="text-muted-fg-faint"> ~ {r.lastDate}</span>
                    </td>
                    <td className="px-4 py-3.5 align-middle">
                      <div className="flex flex-col gap-1">
                        <div className="text-muted-fg-faint flex items-center gap-2 text-xs whitespace-nowrap">
                          <span className="text-ink font-semibold">
                            {r.done}/{active}
                          </span>
                          완료
                          <span className="text-accent-blue-ink">예정 {r.upcoming}</span>
                          {r.cancelled > 0 && <span className="text-brand">취소 {r.cancelled}</span>}
                        </div>
                        <div className="bg-rule h-1.5 w-28 overflow-hidden rounded-full">
                          <div className="bg-progress h-full rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 align-middle whitespace-nowrap md:px-6">
                      <span
                        className={cn(
                          "font-semibold",
                          remaining === 0 ? "text-brand" : remaining <= 2 ? "text-[#B97400]" : "text-muted-fg",
                        )}
                      >
                        {remaining}
                      </span>
                      <span className="text-muted-fg-faint"> / {MAX_CANCELLATIONS}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

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
