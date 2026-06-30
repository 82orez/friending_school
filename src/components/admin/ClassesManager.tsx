"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, CalendarClock, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { adminCancelClass, adminRescheduleClass } from "@/app/admin/actions";
import { fmtTime, GRID_START_HOUR, GRID_END_HOUR, SLOT_MIN } from "@/lib/availability";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type AdminClass = {
  id: string;
  enrollment_id: string;
  student_id: string;
  teacher_id: string;
  course: string;
  course_title: string;
  teacher_name: string | null;
  student_name: string | null;
  student_english_name: string | null;
  session_no: number;
  session_date: string;
  start_min: number;
  end_min: number;
  status: "예정" | "취소";
  is_makeup: boolean;
  feedback: string | null;
  feedback_at: string | null;
};

type StatusKey = AdminClass["status"];

const STATUS_BADGE: Record<StatusKey, string> = {
  예정: "bg-accent-blue-soft text-accent-blue-ink",
  취소: "bg-rule text-muted-fg",
};

const FILTERS: { key: "전체" | StatusKey; label: string }[] = [
  { key: "전체", label: "전체" },
  { key: "예정", label: "예정" },
  { key: "취소", label: "취소" },
];

type SortKey = "date" | "course" | "student" | "teacher" | "session";

const SORT_VALUE: Record<SortKey, (r: AdminClass) => string> = {
  date: (r) => r.session_date,
  course: (r) => r.course_title,
  student: (r) => r.student_name ?? "",
  teacher: (r) => r.teacher_name ?? "",
  session: (r) => String(r.session_no).padStart(3, "0"),
};

// 시각 <select> 옵션 — 06:00~24:00, 30분.
const TIME_OPTIONS: { min: number; label: string }[] = [];
for (let m = GRID_START_HOUR * 60; m <= GRID_END_HOUR * 60; m += SLOT_MIN) TIME_OPTIONS.push({ min: m, label: fmtTime(m) });

function timeRange(start: number, end: number): string {
  return `${fmtTime(start)}~${fmtTime(end)}`;
}

export default function ClassesManager({
  classes,
  title = "화상수업 관리",
  subtitle = "결제 확정 시 생성된 전체 수업입니다. 예정 수업은 강제 취소(보강 옵션)·일정 변경할 수 있습니다.",
  backHref,
}: {
  classes: AdminClass[];
  title?: string;
  subtitle?: string;
  backHref?: string;
}) {
  const [rows, setRows] = useState(classes);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"전체" | StatusKey>("전체");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const toggleSort = (key: SortKey) => setSort((prev) => (prev?.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const counts = useMemo(() => {
    const c: Record<string, number> = { 전체: rows.length, 예정: 0, 취소: 0 };
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = rows.filter((r) => {
      if (filter !== "전체" && r.status !== filter) return false;
      if (!q) return true;
      return `${r.student_name ?? ""} ${r.student_english_name ?? ""} ${r.teacher_name ?? ""} ${r.course_title}`.toLowerCase().includes(q);
    });
    if (!sort) return base;
    const val = (r: AdminClass) => SORT_VALUE[sort.key](r).trim();
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

  const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId]);

  return (
    <div>
      {backHref && (
        <Link href={backHref} className="text-muted-fg hover:text-ink mb-3 inline-flex items-center gap-1 text-sm font-semibold transition-colors">
          <ArrowLeft className="size-4" aria-hidden /> 목록으로
        </Link>
      )}
      <h1 className="text-ink text-2xl font-extrabold">{title}</h1>
      <p className="text-muted-fg mt-1 text-sm">{subtitle}</p>

      <div className="mt-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={active}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                active ? "bg-ink border-ink text-white" : "border-rule text-muted-fg hover:border-accent-blue hover:text-accent-blue-ink bg-white",
              )}
            >
              {f.label} <span className={cn("ml-0.5", active ? "text-white/70" : "text-muted-fg-faint")}>{counts[f.key] ?? 0}</span>
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
        <table className="w-full min-w-[680px] border-collapse text-sm">
          <thead>
            <tr className="border-rule bg-surface text-muted-fg-faint border-b text-left text-xs font-semibold">
              <th className="px-4 py-2.5 md:px-6">상태</th>
              <SortHeader label="날짜" sortKey="date" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
              <th className="px-4 py-2.5">시간</th>
              <SortHeader label="과정" sortKey="course" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
              <SortHeader label="학생" sortKey="student" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
              <SortHeader label="강사" sortKey="teacher" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
              <SortHeader label="회차" sortKey="session" sort={sort} onSort={toggleSort} className="px-4 py-2.5 md:px-6" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-muted-fg px-6 py-12 text-center text-sm">
                  표시할 수업이 없습니다.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedId(r.id);
                    }
                  }}
                  tabIndex={0}
                  className={cn(
                    "border-rule hover:bg-surface/60 focus-visible:bg-surface/60 cursor-pointer border-b transition-colors outline-none last:border-b-0",
                    r.status === "취소" && "opacity-55",
                  )}
                >
                  <td className="px-4 py-3.5 align-middle md:px-6">
                    <div className="flex flex-col items-start gap-1.5">
                      <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold", STATUS_BADGE[r.status])}>{r.status}</span>
                      {r.is_makeup && <span className="bg-progress/10 text-progress shrink-0 rounded-full px-2 py-0.5 text-xs font-bold">보강</span>}
                      {r.feedback && <span className="bg-accent-blue-soft text-accent-blue-ink shrink-0 rounded-full px-2 py-0.5 text-xs font-bold">피드백</span>}
                    </div>
                  </td>
                  <td className="text-ink px-4 py-3.5 align-middle whitespace-nowrap">{r.session_date}</td>
                  <td className="text-muted-fg px-4 py-3.5 align-middle whitespace-nowrap">{timeRange(r.start_min, r.end_min)}</td>
                  <td className="text-muted-fg max-w-[12rem] truncate px-4 py-3.5 align-middle">{r.course_title}</td>
                  <td className="text-ink max-w-[10rem] truncate px-4 py-3.5 align-middle font-bold">{r.student_name ?? "학생"}</td>
                  <td className="text-muted-fg max-w-[10rem] truncate px-4 py-3.5 align-middle">{r.teacher_name ?? "강사"}</td>
                  <td className="text-muted-fg-faint px-4 py-3.5 align-middle whitespace-nowrap md:px-6">#{r.session_no}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <ClassDetailModal
          cls={selected}
          onClose={() => setSelectedId(null)}
          onUpdated={(updated) => setRows((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))}
        />
      )}
    </div>
  );
}

function ClassDetailModal({
  cls: row,
  onClose,
  onUpdated,
}: {
  cls: AdminClass;
  onClose: () => void;
  onUpdated: (updated: AdminClass) => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [makeup, setMakeup] = useState(true);
  const [date, setDate] = useState(row.session_date);
  const [startMin, setStartMin] = useState(row.start_min);
  const [endMin, setEndMin] = useState(row.end_min);
  const [pending, startTransition] = useTransition();
  const editable = row.status === "예정";

  const confirmingRef = useRef(false);
  confirmingRef.current = cancelOpen || rescheduleOpen;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !confirmingRef.current) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const studentLabel = row.student_name ?? "학생";

  const doCancel = () => {
    setCancelOpen(false);
    startTransition(async () => {
      const res = await adminCancelClass(row.id, makeup);
      if (res.ok) {
        onUpdated({ ...row, status: "취소" });
        toast.success(makeup ? "수업을 취소하고 보강을 생성했어요." : "수업을 취소했어요.");
        onClose();
      } else {
        toast.error(res.error ?? "취소 중 문제가 발생했어요.");
      }
    });
  };

  const askReschedule = () => {
    if (startMin >= endMin) {
      toast.error("종료 시각은 시작 시각보다 뒤여야 해요.");
      return;
    }
    setRescheduleOpen(true);
  };

  const doReschedule = () => {
    setRescheduleOpen(false);
    startTransition(async () => {
      const res = await adminRescheduleClass(row.id, date, startMin, endMin);
      if (res.ok) {
        onUpdated({ ...row, session_date: date, start_min: startMin, end_min: endMin });
        toast.success("수업 일정을 변경했어요.");
        onClose();
      } else {
        toast.error(res.error ?? "일정 변경 중 문제가 발생했어요.");
      }
    });
  };

  return (
    <>
      <div aria-hidden="true" onClick={onClose} className="fixed inset-0 z-[110] bg-black/40" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${studentLabel} · ${row.course_title}`}
        className="fixed top-1/2 left-1/2 z-[120] flex max-h-[90vh] w-[min(92vw,640px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        <div className="border-rule flex items-center justify-between gap-3 border-b px-6 py-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold", STATUS_BADGE[row.status])}>{row.status}</span>
            {row.is_makeup && <span className="bg-progress/10 text-progress shrink-0 rounded-full px-2 py-0.5 text-xs font-bold">보강</span>}
            <h2 className="text-ink truncate text-lg font-bold">
              {studentLabel}
              <span className="text-muted-fg-faint font-normal"> · {row.teacher_name ?? "강사"}</span>
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-muted-fg-faint hover:text-ink focus-visible:ring-accent-blue/50 ml-1 shrink-0 rounded transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="overflow-auto px-6 py-5">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm">
            {[
              ["학생", row.student_name ?? "-"],
              ["영문명", row.student_english_name ?? "-"],
              ["강사", row.teacher_name ?? "-"],
              ["과정", row.course_title],
              ["회차", `${row.session_no}회차${row.is_makeup ? " (보강)" : ""}`],
              ["날짜", row.session_date],
              ["시간", timeRange(row.start_min, row.end_min)],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-2">
                <dt className="text-muted-fg-faint w-24 shrink-0">{label}</dt>
                <dd className="text-ink break-words whitespace-pre-wrap">{value}</dd>
              </div>
            ))}
          </dl>

          {/* 강사 피드백(읽기 전용) */}
          {row.feedback && (
            <div className="border-accent-blue-soft bg-accent-blue-soft/30 mt-4 rounded-lg border p-3">
              <p className="text-accent-blue-ink mb-1 text-xs font-bold">
                강사 피드백{row.feedback_at ? ` · ${new Date(row.feedback_at).toLocaleDateString("ko-KR")}` : ""}
              </p>
              <p className="text-ink-soft text-sm break-words whitespace-pre-wrap">{row.feedback}</p>
            </div>
          )}

          {editable ? (
            <div className="mt-6 space-y-6">
              {/* 일정 변경 */}
              <section className="border-rule rounded-lg border p-4">
                <h3 className="text-ink flex items-center gap-1.5 text-sm font-bold">
                  <CalendarClock className="size-4" aria-hidden /> 일정 변경
                </h3>
                <p className="text-muted-fg-faint mt-1 text-xs">강사 가용시간 안이고 다른 예정 수업과 겹치지 않는 시간만 저장됩니다.</p>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-muted-fg-faint text-xs font-semibold">날짜</span>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="border-rule-faint focus:border-accent-blue rounded-md border bg-white px-3 py-1.5 text-sm outline-none"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-muted-fg-faint text-xs font-semibold">시작</span>
                    <select
                      value={startMin}
                      onChange={(e) => setStartMin(Number(e.target.value))}
                      className="border-rule-faint focus:border-accent-blue rounded-md border bg-white px-3 py-1.5 text-sm outline-none"
                    >
                      {TIME_OPTIONS.filter((o) => o.min < GRID_END_HOUR * 60).map((o) => (
                        <option key={o.min} value={o.min}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-muted-fg-faint text-xs font-semibold">종료</span>
                    <select
                      value={endMin}
                      onChange={(e) => setEndMin(Number(e.target.value))}
                      className="border-rule-faint focus:border-accent-blue rounded-md border bg-white px-3 py-1.5 text-sm outline-none"
                    >
                      {TIME_OPTIONS.filter((o) => o.min > GRID_START_HOUR * 60).map((o) => (
                        <option key={o.min} value={o.min}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={askReschedule}
                    disabled={pending}
                    className="bg-cta inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {pending && <Loader2 className="size-3.5 animate-spin" />}
                    일정 변경
                  </button>
                </div>
              </section>

              {/* 수업 취소 */}
              <section className="border-brand/30 rounded-lg border p-4">
                <h3 className="text-brand text-sm font-bold">수업 취소</h3>
                <label className="text-muted-fg mt-3 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={makeup} onChange={(e) => setMakeup(e.target.checked)} className="size-4" />
                  보강 수업 생성 (과정 마지막 수업 다음 빈 날짜)
                </label>
                <button
                  type="button"
                  onClick={() => setCancelOpen(true)}
                  disabled={pending}
                  className="border-brand/40 text-brand hover:bg-brand/5 mt-3 inline-flex h-9 items-center gap-1.5 rounded-md border px-4 text-sm font-bold transition-colors disabled:opacity-50"
                >
                  {pending && <Loader2 className="size-3.5 animate-spin" />}
                  수업 취소
                </button>
              </section>
            </div>
          ) : (
            <p className="text-muted-fg mt-5 text-sm">취소된 수업입니다(읽기 전용).</p>
          )}
        </div>

        <div className="border-rule flex justify-end gap-2 border-t px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="border-rule text-muted-fg hover:bg-surface rounded-md border px-4 py-2 text-sm font-bold transition-colors"
          >
            닫기
          </button>
        </div>
      </div>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent className="z-[130]">
          <AlertDialogHeader>
            <AlertDialogTitle>이 수업을 취소할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="text-ink font-semibold">{studentLabel}</span>님의 {row.session_date} {timeRange(row.start_min, row.end_min)} 수업이 취소됩니다.
              {makeup ? " 보강 수업이 자동 생성됩니다." : " 보강은 생성되지 않습니다."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>돌아가기</AlertDialogCancel>
            <AlertDialogAction onClick={doCancel} className="bg-brand hover:bg-brand/90 border-transparent text-white">
              수업 취소
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <AlertDialogContent className="z-[130]">
          <AlertDialogHeader>
            <AlertDialogTitle>일정을 변경할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="text-ink font-semibold">{studentLabel}</span>님의 수업을 {date} {timeRange(startMin, endMin)}로 변경합니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>돌아가기</AlertDialogCancel>
            <AlertDialogAction onClick={doReschedule} className="bg-cta hover:bg-cta/90 border-transparent text-white">
              일정 변경
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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
