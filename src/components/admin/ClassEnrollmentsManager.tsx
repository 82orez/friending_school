"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAX_CANCELLATIONS } from "@/lib/classtime";
import ClassWeekGrid, { type AdminSession } from "./ClassWeekGrid";

export type ClassEnrollmentSummary = {
  enrollmentId: string;
  course: string;
  courseTitle: string;
  studentName: string | null;
  studentEnglishName: string | null;
  teacherName: string | null;
  centerName: string | null; // 강사 현재 소속 센터명(역산, 미지정 강사는 null)
  total: number;
  upcoming: number;
  done: number;
  cancelled: number;
  postponed: number; // 학생 연기(cancel_reason='student') 수 — '남은 연기' 차감분
  makeup: number;
  firstDate: string;
  lastDate: string;
  schedule: string; // 주간 요일·시작시각 요약(예: "월 14:00 · 수 14:00")
  liveStartMs: number | null; // 가장 이른 미종료 회차의 입장 가능 시작(시작 15분 전) — 없으면 null
  liveEndMs: number | null; // 그 회차의 레슨 종료 시각
  refunded: boolean; // enrollment가 환불/취소됨 — '완료' 아닌 '환불'로 표시
};

type FilterKey = "전체" | "진행중" | "완료" | "환불";
const FILTERS: FilterKey[] = ["전체", "진행중", "완료", "환불"];
const REFUND_BADGE = "bg-[#FFF4E5] text-[#B45309]";
const isOngoing = (r: ClassEnrollmentSummary) => !r.refunded && r.upcoming > 0;
// 지금 라이브(입장 15분 전~레슨 종료) 회차가 있는 과정 — 상세 뷰 "진행중" 기준과 동일.
const isLive = (r: ClassEnrollmentSummary, now: number) => r.liveStartMs !== null && now >= r.liveStartMs && now < (r.liveEndMs ?? 0);

type SortKey = "course" | "student" | "teacher" | "start";

const SORT_VALUE: Record<SortKey, (r: ClassEnrollmentSummary) => string> = {
  course: (r) => r.courseTitle,
  student: (r) => r.studentName ?? "",
  teacher: (r) => r.teacherName ?? "",
  start: (r) => r.firstDate,
};

export default function ClassEnrollmentsManager({ rows, sessions }: { rows: ClassEnrollmentSummary[]; sessions: AdminSession[] }) {
  const router = useRouter();
  const [view, setView] = useState<"list" | "weekly">("list");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("전체");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  // 1분 틱 — 라이브 배지·정렬 실시간 갱신(상세 뷰와 동일 관례).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const toggleSort = (key: SortKey) => setSort((prev) => (prev?.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const counts = useMemo(() => {
    const c = { 전체: rows.length, 진행중: 0, 완료: 0, 환불: 0 };
    for (const r of rows) {
      if (r.refunded) c.환불 += 1;
      else if (isOngoing(r)) c.진행중 += 1;
      else c.완료 += 1;
    }
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = rows.filter((r) => {
      if (filter === "환불" && !r.refunded) return false;
      if (filter === "진행중" && (r.refunded || !isOngoing(r))) return false;
      if (filter === "완료" && (r.refunded || isOngoing(r))) return false;
      if (!q) return true;
      return `${r.studentName ?? ""} ${r.studentEnglishName ?? ""} ${r.teacherName ?? ""} ${r.centerName ?? ""} ${r.courseTitle}`.toLowerCase().includes(q);
    });
    let arr = base;
    if (sort) {
      const val = (r: ClassEnrollmentSummary) => SORT_VALUE[sort.key](r).trim();
      arr = [...base].sort((a, b) => {
        const av = val(a);
        const bv = val(b);
        if (!av && !bv) return 0;
        if (!av) return 1;
        if (!bv) return -1;
        const cmp = av.localeCompare(bv, "ko");
        return sort.dir === "asc" ? cmp : -cmp;
      });
    }
    // 라이브 과정을 항상 최상단으로(안정 정렬 — 기존 순서·사용자 정렬은 그룹 내에서 보존).
    return [...arr].sort((a, b) => Number(isLive(b, now)) - Number(isLive(a, now)));
  }, [rows, query, filter, sort, now]);

  const open = (id: string) => router.push(`/admin/classes/${id}`);

  return (
    <div>
      <h1 className="text-ink text-2xl font-extrabold">화상수업 관리</h1>
      <p className="text-muted-fg mt-1 text-sm">수강신청으로 생성된 과정 목록입니다. 행을 클릭하면 해당 과정의 수업을 관리할 수 있습니다.</p>

      <div className="bg-surface mt-5 inline-flex rounded-lg p-1">
        {(["list", "weekly"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => setView(v)}
            className={cn(
              "focus-visible:ring-accent-blue/50 rounded-md px-4 py-1.5 text-sm font-bold transition-colors focus-visible:ring-2 focus-visible:outline-none",
              view === v ? "text-ink bg-white shadow-sm" : "text-muted-fg",
            )}>
            {v === "list" ? "목록" : "주간"}
          </button>
        ))}
      </div>

      {view === "weekly" ? (
        <div className="mt-5">
          <ClassWeekGrid sessions={sessions} now={now} />
        </div>
      ) : (
        <>
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
              <th className="px-4 py-2.5 md:px-6">남은 연기</th>
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
                const live = isLive(r, now);
                const active = r.total - r.cancelled;
                const pct = active > 0 ? Math.round((r.done / active) * 100) : 0;
                const remaining = Math.max(0, MAX_CANCELLATIONS - r.postponed);
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
                        {live && (
                          <span className="bg-cta shrink-0 animate-pulse rounded-full px-2.5 py-0.5 text-xs font-bold text-white">● 수업 중</span>
                        )}
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold",
                            r.refunded ? REFUND_BADGE : ongoing ? "bg-accent-blue-soft text-accent-blue-ink" : "bg-rule text-muted-fg",
                          )}
                        >
                          {r.refunded ? "환불" : ongoing ? "진행중" : "완료"}
                        </span>
                        {r.makeup > 0 && <span className="bg-progress/10 text-progress shrink-0 rounded-full px-2 py-0.5 text-xs font-bold">보강 {r.makeup}</span>}
                      </div>
                    </td>
                    <td className="text-ink max-w-[12rem] truncate px-4 py-3.5 align-middle font-bold">{r.courseTitle}</td>
                    <td className="text-ink max-w-[10rem] truncate px-4 py-3.5 align-middle">
                      {r.studentName ?? "학생"}
                      {r.studentEnglishName && <span className="text-muted-fg-faint"> ({r.studentEnglishName})</span>}
                    </td>
                    <td className="text-muted-fg max-w-[10rem] px-4 py-3.5 align-middle">
                      <span className="block truncate">{r.teacherName ?? "강사"}</span>
                      <span className="text-muted-fg-faint mt-0.5 block truncate text-xs">{r.centerName ?? "미지정"}</span>
                    </td>
                    <td className="text-muted-fg px-4 py-3.5 align-middle whitespace-nowrap">
                      <span className="block">
                        {r.firstDate}
                        <span className="text-muted-fg-faint"> ~ {r.lastDate}</span>
                      </span>
                      {r.schedule && <span className="text-muted-fg-faint mt-0.5 block text-xs font-medium">{r.schedule}</span>}
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
        </>
      )}
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
