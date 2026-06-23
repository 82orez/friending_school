"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { approveEnrollment, rejectEnrollment } from "@/app/teacher/actions";
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

export type TeacherEnrollment = {
  id: string;
  studentName: string;
  courseTitle: string;
  startDate: string;
  slots: Slot[];
  status: "신청" | "승인" | "거절" | "취소";
  teacherNote: string | null;
  createdAt: string;
};

const STATUS_LABEL: Record<TeacherEnrollment["status"], string> = {
  신청: "Pending",
  승인: "Approved",
  거절: "Declined",
  취소: "Cancelled",
};

const STATUS_BADGE: Record<TeacherEnrollment["status"], string> = {
  신청: "bg-[#FFF7E6] text-[#B97400]",
  승인: "bg-[#E1F5EE] text-[#0F6E56]",
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
  open,
  onToggle,
  onUpdated,
}: {
  row: TeacherEnrollment;
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

  const approve = () => {
    setConfirmApprove(false);
    setBusyAction("approve");
    startTransition(async () => {
      const res = await approveEnrollment(row.id);
      if (res.ok) {
        onUpdated({ ...row, status: "승인" });
        toast.success("Enrollment approved. The student has been notified by SMS.");
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
    <li className="border-rule border-b last:border-b-0">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3.5 text-left md:px-6">
        <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold", STATUS_BADGE[row.status])}>{STATUS_LABEL[row.status]}</span>
        <div className="min-w-0 flex-1">
          <p className="text-ink truncate text-sm font-bold">
            {row.studentName}
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
          <dl className="mb-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm">
            {[
              ["Student", row.studentName],
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
              <span className="text-ink font-semibold">{row.studentName}</span> will be notified by SMS that their enrollment for {row.courseTitle} is
              approved.
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
              <span className="text-ink font-semibold">{row.studentName}</span> will be notified by SMS with the reason you entered.
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
