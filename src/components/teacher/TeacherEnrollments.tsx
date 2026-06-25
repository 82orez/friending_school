"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronDown, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { approveEnrollment, rejectEnrollment } from "@/app/teacher/actions";
import { overlappingIds, summarizeSlots, type Slot } from "@/lib/availability";

// 시간 충돌 표시 대상 = 진행중 상태(거절/취소는 제외).
const ACTIVE_STATUSES = new Set<TeacherEnrollment["status"]>(["신청", "승인", "결제대기"]);
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
  slots: Slot[];
  status: "신청" | "승인" | "결제대기" | "거절" | "취소";
  teacherNote: string | null;
  createdAt: string;
};

const STATUS_LABEL: Record<TeacherEnrollment["status"], string> = {
  신청: "Pending",
  승인: "Approved",
  결제대기: "Payment pending",
  거절: "Declined",
  취소: "Cancelled",
};

const STATUS_BADGE: Record<TeacherEnrollment["status"], string> = {
  신청: "bg-[#FFF7E6] text-[#B97400]",
  승인: "bg-[#E1F5EE] text-[#0F6E56]",
  결제대기: "bg-[#F3EEFD] text-[#6B4AD4]",
  거절: "bg-brand/10 text-brand",
  취소: "bg-rule text-muted-fg",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

export default function TeacherEnrollments({ enrollments }: { enrollments: TeacherEnrollment[] }) {
  const [rows, setRows] = useState(enrollments);
  const [openId, setOpenId] = useState<string | null>(null);

  const pending = useMemo(() => rows.filter((r) => r.status === "신청").length, [rows]);

  // 같은 강사(=본인) 내 진행중 신청끼리 시간이 겹치는 행 id 집합.
  const conflictIds = useMemo(
    () => overlappingIds(rows.filter((r) => ACTIVE_STATUSES.has(r.status)).map((r) => ({ id: r.id, group: "self", slots: r.slots }))),
    [rows],
  );

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-ink text-lg font-bold">Enrollment requests</h2>
        {pending > 0 && <span className="bg-brand/10 text-brand rounded-full px-2.5 py-0.5 text-xs font-bold">{pending} pending</span>}
      </div>

      <div className="border-rule overflow-hidden rounded-2xl border bg-white">
        {rows.length === 0 ? (
          <p className="text-muted-fg px-6 py-12 text-center text-sm">No enrollment requests yet.</p>
        ) : (
          <ul className="list-none">
            {rows.map((r) => (
              <EnrollmentRow
                key={r.id}
                row={r}
                conflict={conflictIds.has(r.id)}
                open={openId === r.id}
                onToggle={() => setOpenId(openId === r.id ? null : r.id)}
                onUpdated={(updated) => setRows((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function EnrollmentRow({
  row,
  conflict,
  open,
  onToggle,
  onUpdated,
}: {
  row: TeacherEnrollment;
  conflict: boolean;
  open: boolean;
  onToggle: () => void;
  onUpdated: (updated: TeacherEnrollment) => void;
}) {
  const [note, setNote] = useState(row.teacherNote ?? "");
  const [pending, startTransition] = useTransition();
  const [busyAction, setBusyAction] = useState<null | "approve" | "reject">(null);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const isPending = row.status === "신청";
  // 영어이름(한국이름) 표시 — 영문명 없으면(백필 안 된 구 행) 한국명만.
  const studentLabel = row.studentEnglishName ? `${row.studentEnglishName}(${row.studentName})` : row.studentName;

  const approve = () => {
    setConfirmApprove(false);
    setBusyAction("approve");
    startTransition(async () => {
      const res = await approveEnrollment(row.id);
      if (res.ok) {
        onUpdated({ ...row, status: "결제대기" });
        toast.success("Enrollment approved — now awaiting payment. The student has been notified by SMS.");
      } else {
        toast.error(res.error ?? "Something went wrong.");
      }
      setBusyAction(null);
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
      } else {
        toast.error(res.error ?? "Something went wrong.");
      }
      setBusyAction(null);
    });
  };

  return (
    <li className={cn("border-rule border-b last:border-b-0", conflict && "border-l-2 border-l-[#F5A623]")}>
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3.5 text-left md:px-6">
        <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold", STATUS_BADGE[row.status])}>{STATUS_LABEL[row.status]}</span>
        {conflict && (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#FFF7E6] px-2 py-0.5 text-xs font-bold text-[#B97400]"
            title="This time overlaps with another active request.">
            <TriangleAlert className="size-3" aria-hidden /> Time conflict
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-ink truncate text-sm font-bold">
            {studentLabel}
            <span className="text-muted-fg-faint font-normal"> · {row.courseTitle}</span>
          </p>
          <p className="text-muted-fg truncate text-xs">
            {summarizeSlots(row.slots, false)} · start {row.startDate}
          </p>
        </div>
        <span className="text-muted-fg-faint shrink-0 text-xs">{formatDate(row.createdAt)}</span>
        <ChevronDown aria-hidden className={cn("text-muted-fg-faint size-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="bg-surface border-rule border-t px-4 py-4 md:px-6">
          {conflict && (
            <p className="mb-3 inline-flex items-center gap-1.5 rounded-md bg-[#FFF7E6] px-2.5 py-1.5 text-xs font-semibold text-[#B97400]">
              <TriangleAlert className="size-3.5 shrink-0" aria-hidden /> This time overlaps with another active enrollment — only one can be approved.
            </p>
          )}
          <dl className="mb-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm">
            {[
              ["Student", studentLabel],
              ["Course", row.courseTitle],
              ["Weekly schedule", summarizeSlots(row.slots, false)],
              ["Start date", row.startDate],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-2">
                <dt className="text-muted-fg-faint w-32 shrink-0">{label}</dt>
                <dd className="text-ink break-words whitespace-pre-wrap">{value}</dd>
              </div>
            ))}
          </dl>

          {isPending ? (
            <>
              <label className="text-muted-fg-faint mb-1 block text-xs font-semibold">Reason for declining (shown to the student via SMS)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Required only when declining..."
                className="border-rule-faint focus:border-accent-blue mb-3 w-full rounded-md border bg-white px-3 py-2 text-sm outline-none"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmApprove(true)}
                  disabled={pending}
                  className="bg-cta inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50">
                  {busyAction === "approve" && <Loader2 className="size-3.5 animate-spin" />}
                  Approve
                </button>
                <button
                  type="button"
                  onClick={askReject}
                  disabled={pending}
                  className="border-brand/40 text-brand hover:bg-brand/5 inline-flex h-9 items-center gap-1.5 rounded-md border px-4 text-sm font-bold transition-colors disabled:opacity-50">
                  {busyAction === "reject" && <Loader2 className="size-3.5 animate-spin" />}
                  Decline
                </button>
              </div>
            </>
          ) : (
            <p className="text-muted-fg text-sm">
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
      )}

      <AlertDialog open={confirmApprove} onOpenChange={setConfirmApprove}>
        <AlertDialogContent>
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
        <AlertDialogContent>
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
    </li>
  );
}
