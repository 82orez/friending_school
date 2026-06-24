"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronDown, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { adminCancelEnrollment } from "@/app/admin/actions";
import { summarizeSlots, type Slot } from "@/lib/availability";
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

export type AdminEnrollment = {
  id: string;
  course_title: string;
  teacher_name: string | null;
  student_name: string | null;
  student_phone: string | null;
  slots: Slot[];
  start_date: string;
  status: "신청" | "승인" | "거절" | "취소";
  teacher_note: string | null;
  created_at: string;
};

type StatusKey = AdminEnrollment["status"];

const STATUS_BADGE: Record<StatusKey, string> = {
  신청: "bg-accent-blue-soft text-accent-blue-ink",
  승인: "bg-[#E1F5EE] text-[#0F6E56]",
  거절: "bg-brand/10 text-brand",
  취소: "bg-rule text-muted-fg",
};

const FILTERS: { key: "전체" | StatusKey; label: string }[] = [
  { key: "전체", label: "전체" },
  { key: "신청", label: "승인 대기" },
  { key: "승인", label: "승인" },
  { key: "거절", label: "거절" },
  { key: "취소", label: "취소" },
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

export default function EnrollmentsManager({ enrollments }: { enrollments: AdminEnrollment[] }) {
  const [rows, setRows] = useState(enrollments);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"전체" | StatusKey>("전체");
  const [openId, setOpenId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = { 전체: rows.length, 신청: 0, 승인: 0, 거절: 0, 취소: 0 };
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "전체" && r.status !== filter) return false;
      if (!q) return true;
      return `${r.student_name ?? ""} ${r.teacher_name ?? ""} ${r.course_title}`.toLowerCase().includes(q);
    });
  }, [rows, query, filter]);

  return (
    <div>
      <h1 className="text-ink text-2xl font-extrabold">수강신청 관리</h1>
      <p className="text-muted-fg mt-1 text-sm">전체 수강신청 내역입니다. 대기·승인 건은 필요 시 강제 취소할 수 있습니다.</p>

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

      <div className="border-rule mt-4 overflow-hidden rounded-xl border bg-white">
        {filtered.length === 0 ? (
          <p className="text-muted-fg px-6 py-12 text-center text-sm">표시할 수강신청이 없습니다.</p>
        ) : (
          <ul className="list-none">
            {filtered.map((r) => (
              <EnrollmentRow
                key={r.id}
                row={r}
                open={openId === r.id}
                onToggle={() => setOpenId(openId === r.id ? null : r.id)}
                onUpdated={(updated) => setRows((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EnrollmentRow({
  row,
  open,
  onToggle,
  onUpdated,
}: {
  row: AdminEnrollment;
  open: boolean;
  onToggle: () => void;
  onUpdated: (updated: AdminEnrollment) => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const cancellable = row.status === "신청" || row.status === "승인";

  const askCancel = () => {
    if (!reason.trim()) {
      toast.error("취소 사유를 입력해 주세요.");
      return;
    }
    setConfirmOpen(true);
  };

  const cancel = () => {
    setConfirmOpen(false);
    startTransition(async () => {
      const res = await adminCancelEnrollment(row.id, reason);
      if (res.ok) {
        onUpdated({ ...row, status: "취소", teacher_note: `[관리자] ${reason.trim()}` });
        toast.success("수강신청을 취소했어요. 학생에게 안내 문자가 발송됩니다.");
      } else {
        toast.error(res.error ?? "취소 중 문제가 발생했어요.");
      }
    });
  };

  return (
    <li className="border-rule border-b last:border-b-0">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3.5 text-left md:px-6">
        <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold", STATUS_BADGE[row.status])}>{row.status}</span>
        <div className="min-w-0 flex-1">
          <p className="text-ink truncate text-sm font-bold">
            {row.student_name ?? "학생"}
            <span className="text-muted-fg-faint font-normal"> → {row.teacher_name ?? "강사"}</span>
          </p>
          <p className="text-muted-fg truncate text-xs">
            {row.course_title} · 시작 {row.start_date}
          </p>
        </div>
        <span className="text-muted-fg-faint shrink-0 text-xs">{formatDate(row.created_at)}</span>
        <ChevronDown aria-hidden className={cn("text-muted-fg-faint size-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="bg-surface border-rule border-t px-4 py-4 md:px-6">
          <dl className="mb-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm">
            {[
              ["학생", row.student_name ?? "-"],
              ["전화", row.student_phone ?? "-"],
              ["강사", row.teacher_name ?? "-"],
              ["과정", row.course_title],
              ["수업 일정", summarizeSlots(row.slots)],
              ["시작일", row.start_date],
              ...(row.teacher_note ? ([["메모/사유", row.teacher_note]] as [string, string][]) : []),
            ].map(([label, value]) => (
              <div key={label} className="flex gap-2">
                <dt className="text-muted-fg-faint w-24 shrink-0">{label}</dt>
                <dd className="text-ink break-words whitespace-pre-wrap">{value}</dd>
              </div>
            ))}
          </dl>

          {cancellable ? (
            <>
              <label className="text-muted-fg-faint mb-1 block text-xs font-semibold">취소 사유 (학생에게 문자로 전송됩니다)</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="강제 취소 사유를 입력하세요..."
                className="border-rule-faint focus:border-accent-blue mb-3 w-full rounded-md border bg-white px-3 py-2 text-sm outline-none"
              />
              <button
                type="button"
                onClick={askCancel}
                disabled={pending}
                className="border-brand/40 text-brand hover:bg-brand/5 inline-flex h-9 items-center gap-1.5 rounded-md border px-4 text-sm font-bold transition-colors disabled:opacity-50"
              >
                {pending && <Loader2 className="size-3.5 animate-spin" />}
                취소 처리
              </button>
            </>
          ) : (
            <p className="text-muted-fg text-sm">처리 완료된 신청입니다(읽기 전용).</p>
          )}
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>이 수강신청을 강제 취소할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="text-ink font-semibold">{row.student_name ?? "학생"}</span>님의 {row.course_title} 신청이 취소되며, 입력한 사유가
              문자로 전송됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>돌아가기</AlertDialogCancel>
            <AlertDialogAction onClick={cancel} className="bg-brand hover:bg-brand/90 border-transparent text-white">
              취소 처리
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
