"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { approveEnrollment, rejectEnrollment } from "@/app/teacher/actions";
import { overlappingIds, summarizeSlots, lessonEndDate, type Slot } from "@/lib/availability";

// 시간 충돌 표시 대상 = 진행중 상태(거절/취소는 제외).
const ACTIVE_STATUSES = new Set<TeacherEnrollment["status"]>(["신청", "승인", "결제대기", "결제완료"]);
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

export type TeacherEnrollment = {
  id: string;
  studentName: string;
  studentEnglishName: string;
  courseTitle: string;
  startDate: string;
  totalSessions: number; // 총 수업 횟수(실 신청 24, 테스트 자유) — 종료일·수업 횟수 표시용
  slots: Slot[];
  status: "신청" | "승인" | "결제대기" | "결제완료" | "거절" | "취소";
  teacherNote: string | null;
  createdAt: string;
  refunded?: boolean; // 상태 '취소' 중 환불로 취소된 건 — 'Refunded'로 구분 표시
};

const STATUS_LABEL: Record<TeacherEnrollment["status"], string> = {
  신청: "Pending",
  승인: "Approved",
  결제대기: "Payment pending",
  결제완료: "Paid",
  거절: "Declined",
  취소: "Cancelled",
};

const STATUS_BADGE: Record<TeacherEnrollment["status"], string> = {
  신청: "bg-[#FFF7E6] text-[#B97400]",
  승인: "bg-[#E1F5EE] text-[#0F6E56]",
  결제대기: "bg-[#F3EEFD] text-[#6B4AD4]",
  결제완료: "bg-[#E6F4EA] text-[#1E7E34]",
  거절: "bg-brand/10 text-brand",
  취소: "bg-rule text-muted-fg",
};

const REFUND_BADGE = "bg-[#FFF4E5] text-[#B45309]";

// 환불로 취소된 건은 'Refunded'로 구분(일반 취소는 'Cancelled').
function isRefunded(r: TeacherEnrollment): boolean {
  return r.status === "취소" && !!r.refunded;
}

type StatusKey = TeacherEnrollment["status"];

const FILTERS: { key: "전체" | StatusKey; label: string }[] = [
  { key: "전체", label: "All" },
  { key: "신청", label: "Pending" },
  { key: "결제대기", label: "Payment pending" },
  { key: "결제완료", label: "Paid" },
  { key: "승인", label: "Approved" },
  { key: "거절", label: "Declined" },
  { key: "취소", label: "Cancelled" },
];

type SortKey = "student" | "start" | "applied";

const SORT_VALUE: Record<SortKey, (r: TeacherEnrollment) => string> = {
  student: (r) => r.studentEnglishName || r.studentName,
  start: (r) => r.startDate,
  applied: (r) => r.createdAt,
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

// 영어이름(한국이름) 표시 — 영문명 없으면(백필 안 된 구 행) 한국명만.
function studentLabelOf(r: TeacherEnrollment): string {
  return r.studentEnglishName ? `${r.studentEnglishName}(${r.studentName})` : r.studentName;
}

// 수업 기간 "시작일 ~ 종료일"(YYYY-MM-DD). 종료일=lessonEndDate(시작+주간 slots+횟수), 계산 불가 시 시작일만.
function schedulePeriod(startDate: string, slots: Slot[], totalSessions: number): string {
  const [y, m, d] = startDate.split("-").map(Number);
  if (!y || !m || !d) return startDate;
  const end = lessonEndDate(new Date(y, m - 1, d), slots, totalSessions);
  if (!end) return startDate;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${startDate} ~ ${end.getFullYear()}-${p(end.getMonth() + 1)}-${p(end.getDate())}`;
}

export default function TeacherEnrollments({ enrollments }: { enrollments: TeacherEnrollment[] }) {
  const [rows, setRows] = useState(enrollments);
  const [filter, setFilter] = useState<"전체" | StatusKey>("전체");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const toggleSort = (key: SortKey) =>
    setSort((prev) => (prev?.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const pending = useMemo(() => rows.filter((r) => r.status === "신청").length, [rows]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { 전체: rows.length, 신청: 0, 결제대기: 0, 결제완료: 0, 승인: 0, 거절: 0, 취소: 0 };
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  // 같은 강사(=본인) 내 진행중 신청끼리 시간이 겹치는 행 id 집합.
  const conflictIds = useMemo(
    () => overlappingIds(rows.filter((r) => ACTIVE_STATUSES.has(r.status)).map((r) => ({ id: r.id, group: "self", slots: r.slots }))),
    [rows],
  );

  const visible = useMemo(() => {
    const base = filter === "전체" ? rows : rows.filter((r) => r.status === filter);
    if (!sort) return base;
    const val = (r: TeacherEnrollment) => SORT_VALUE[sort.key](r).trim();
    return [...base].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      const cmp = av.localeCompare(bv, "en");
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [rows, filter, sort]);

  const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId]);

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-ink text-lg font-bold">Enrollment requests</h2>
        {pending > 0 && <span className="bg-brand/10 text-brand rounded-full px-2.5 py-0.5 text-xs font-bold">{pending} pending</span>}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
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
              )}>
              {f.label} <span className={cn("ml-0.5", active ? "text-white/70" : "text-muted-fg-faint")}>{counts[f.key] ?? 0}</span>
            </button>
          );
        })}
      </div>

      <div className="border-rule overflow-x-auto rounded-2xl border bg-white">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-rule bg-surface text-muted-fg-faint border-b text-left text-xs font-semibold">
              <th className="px-4 py-2.5 md:px-6">Status</th>
              <SortHeader label="Student" sortKey="student" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
              <th className="px-4 py-2.5">Course</th>
              <SortHeader label="Start" sortKey="start" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
              <SortHeader label="Applied" sortKey="applied" sort={sort} onSort={toggleSort} className="px-4 py-2.5 md:px-6" />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-muted-fg px-6 py-12 text-center text-sm">
                  No enrollment requests.
                </td>
              </tr>
            ) : (
              visible.map((r) => {
                const conflict = conflictIds.has(r.id);
                return (
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
                      conflict && "border-l-2 border-l-[#F5A623]",
                    )}>
                    <td className="px-4 py-3.5 align-middle md:px-6">
                      <div className="flex flex-col items-start gap-1.5">
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold",
                            isRefunded(r) ? REFUND_BADGE : STATUS_BADGE[r.status],
                          )}>
                          {isRefunded(r) ? "Refunded" : STATUS_LABEL[r.status]}
                        </span>
                        {conflict && (
                          <span
                            className="bg-brand inline-flex w-fit shrink-0 animate-pulse items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold text-white"
                            title="This time overlaps with another active request.">
                            <TriangleAlert className="size-3" aria-hidden /> Time conflict
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="text-ink max-w-[16rem] truncate px-4 py-3.5 align-middle font-bold">{studentLabelOf(r)}</td>
                    <td className="text-muted-fg max-w-[14rem] truncate px-4 py-3.5 align-middle">{r.courseTitle}</td>
                    <td className="text-ink px-4 py-3.5 align-middle whitespace-nowrap">{r.startDate}</td>
                    <td className="text-muted-fg-faint px-4 py-3.5 align-middle whitespace-nowrap md:px-6">{formatDate(r.createdAt)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <EnrollmentDetailModal
          enrollment={selected}
          conflict={conflictIds.has(selected.id)}
          onClose={() => setSelectedId(null)}
          onUpdated={(updated) => setRows((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))}
        />
      )}
    </section>
  );
}

function EnrollmentDetailModal({
  enrollment: row,
  conflict,
  onClose,
  onUpdated,
}: {
  enrollment: TeacherEnrollment;
  conflict: boolean;
  onClose: () => void;
  onUpdated: (updated: TeacherEnrollment) => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [note, setNote] = useState(row.teacherNote ?? "");
  const [pending, startTransition] = useTransition();
  const [busyAction, setBusyAction] = useState<null | "approve" | "reject">(null);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const isPending = row.status === "신청";
  const studentLabel = studentLabelOf(row);

  // Esc 닫기(확인창 열림 시 무시) + body scroll lock + 닫기 버튼 포커스.
  const confirmingRef = useRef(false);
  confirmingRef.current = confirmApprove || confirmReject;
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

  const approve = () => {
    setConfirmApprove(false);
    setBusyAction("approve");
    startTransition(async () => {
      const res = await approveEnrollment(row.id);
      if (res.ok) {
        onUpdated({ ...row, status: "결제대기" });
        toast.success("Enrollment approved — now awaiting payment. The student has been notified by SMS.");
        onClose();
      } else {
        toast.error(res.error ?? "Something went wrong.");
        setBusyAction(null);
      }
    });
  };

  const askReject = () => {
    if (!note.trim()) {
      toast.error("Please enter a reason for declining.");
      return;
    }
    setConfirmReject(true);
  };

  const reject = () => {
    setConfirmReject(false);
    setBusyAction("reject");
    startTransition(async () => {
      const res = await rejectEnrollment(row.id, note);
      if (res.ok) {
        onUpdated({ ...row, status: "거절", teacherNote: note });
        toast.success("Enrollment declined. The student has been notified by SMS.");
        onClose();
      } else {
        toast.error(res.error ?? "Something went wrong.");
        setBusyAction(null);
      }
    });
  };

  return (
    <>
      <div aria-hidden="true" onClick={onClose} className="fixed inset-0 z-[110] bg-black/40" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${studentLabel} · ${row.courseTitle}`}
        className="fixed top-1/2 left-1/2 z-[120] flex max-h-[90vh] w-[min(92vw,640px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="border-rule flex items-center justify-between gap-3 border-b px-6 py-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold", isRefunded(row) ? REFUND_BADGE : STATUS_BADGE[row.status])}>
              {isRefunded(row) ? "Refunded" : STATUS_LABEL[row.status]}
            </span>
            <h2 className="text-ink truncate text-lg font-bold">{studentLabel}</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted-fg-faint hover:text-ink focus-visible:ring-accent-blue/50 ml-1 shrink-0 rounded transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
            <X className="size-5" />
          </button>
        </div>

        <div className="overflow-auto px-6 py-5">
          {conflict && (
            <p className="mb-4 inline-flex items-center gap-1.5 rounded-md bg-[#FFF7E6] px-2.5 py-1.5 text-xs font-semibold text-[#B97400]">
              <TriangleAlert className="size-3.5 shrink-0" aria-hidden /> This time overlaps with another active enrollment — only one can be
              approved.
            </p>
          )}
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm">
            {(
              [
                ["Student", studentLabel],
                ["Course", row.courseTitle],
                ["Weekly schedule", summarizeSlots(row.slots, false, " / ")],
                ["Class period", schedulePeriod(row.startDate, row.slots, row.totalSessions)],
                ["Sessions", `${row.totalSessions}`],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex gap-2">
                <dt className="text-muted-fg-faint w-32 shrink-0">{label}</dt>
                <dd className="text-ink break-words whitespace-pre-wrap">{value}</dd>
              </div>
            ))}
          </dl>

          {isPending ? (
            <div className="mt-5">
              <label className="text-muted-fg-faint mb-1 block text-xs font-semibold">Reason for declining (shown to the student via SMS)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Required only when declining..."
                className="border-rule-faint focus:border-accent-blue mb-3 w-full rounded-md border bg-white px-3 py-2 text-sm outline-none"
              />
            </div>
          ) : (
            <p className="text-muted-fg mt-5 text-sm">
              {row.status === "승인" && "✅ Approved. The student has been notified."}
              {row.status === "결제대기" && "✅ Approved — awaiting the student's payment."}
              {row.status === "거절" && (
                <>
                  ❌ Declined.
                  {row.teacherNote && <span className="whitespace-pre-wrap"> · Reason: {row.teacherNote}</span>}
                </>
              )}
              {row.status === "취소" && "Cancelled by the student."}
            </p>
          )}
        </div>

        <div className="border-rule flex justify-end gap-2 border-t px-6 py-4">
          {isPending ? (
            <>
              <button
                type="button"
                onClick={askReject}
                disabled={pending}
                className="border-brand/40 text-brand hover:bg-brand/5 inline-flex h-9 items-center gap-1.5 rounded-md border px-4 text-sm font-bold transition-colors disabled:opacity-50">
                {busyAction === "reject" && <Loader2 className="size-3.5 animate-spin" />}
                Decline
              </button>
              <button
                type="button"
                onClick={() => setConfirmApprove(true)}
                disabled={pending}
                className="bg-cta inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50">
                {busyAction === "approve" && <Loader2 className="size-3.5 animate-spin" />}
                Approve
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="border-rule text-muted-fg hover:bg-surface rounded-md border px-4 py-2 text-sm font-bold transition-colors">
              Close
            </button>
          )}
        </div>
      </div>

      <AlertDialog open={confirmApprove} onOpenChange={setConfirmApprove}>
        <AlertDialogContent className="z-[130]">
          <AlertDialogHeader>
            <AlertDialogTitle>Approve this enrollment?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="text-ink font-semibold">{studentLabel}</span> will be notified by SMS that their enrollment for {row.courseTitle} is
              approved and now awaiting payment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={approve} className="bg-cta hover:bg-cta/90 border-transparent text-white">
              Approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmReject} onOpenChange={setConfirmReject}>
        <AlertDialogContent className="z-[130]">
          <AlertDialogHeader>
            <AlertDialogTitle>Decline this enrollment?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="text-ink font-semibold">{studentLabel}</span> will be notified by SMS with the reason you entered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={reject} className="bg-brand hover:bg-brand/90 border-transparent text-white">
              Decline
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
