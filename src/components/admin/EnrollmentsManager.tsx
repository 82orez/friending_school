"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink, Loader2, Search, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { adminCancelEnrollment, confirmPayment, deleteTestEnrollment, refundPayment } from "@/app/admin/actions";
import { overlappingIds, summarizeSlots, type Slot } from "@/lib/availability";
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
  teacher_id: string;
  course_title: string;
  teacher_name: string | null;
  student_name: string | null;
  student_phone: string | null;
  slots: Slot[];
  start_date: string;
  status: "신청" | "승인" | "결제대기" | "결제완료" | "거절" | "취소";
  teacher_note: string | null;
  created_at: string;
  is_test?: boolean;
  priceLabel: string; // 수강료 표시(과정 고정가, 예 "₩240,000")
  payment?: { paymentId: string; status: string; amount: number; cancelledAmount: number; method?: string | null; receiptUrl?: string | null; createdAt?: string } | null; // 결제 기록(카드/무통장, 환불용)
};

type StatusKey = AdminEnrollment["status"];

const STATUS_BADGE: Record<StatusKey, string> = {
  신청: "bg-accent-blue-soft text-accent-blue-ink",
  승인: "bg-[#E1F5EE] text-[#0F6E56]",
  결제대기: "bg-[#F3EEFD] text-[#6B4AD4]",
  결제완료: "bg-[#E6F4EA] text-[#1E7E34]",
  거절: "bg-brand/10 text-brand",
  취소: "bg-rule text-muted-fg",
};

const REFUND_BADGE = "bg-[#FFF4E5] text-[#B45309]";

// 환불 건 = 상태 '취소' + 연결된 결제가 환불(cancelled/partial_cancelled). 일반 취소와 구분 표시.
function isRefunded(r: AdminEnrollment): boolean {
  return r.status === "취소" && (r.payment?.status === "cancelled" || r.payment?.status === "partial_cancelled");
}

// 환불은 별도 상태값이 아니라 '취소' + 환불 결제의 파생 필터(FilterKey로만 존재).
type FilterKey = "전체" | StatusKey | "환불";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "전체", label: "전체" },
  { key: "신청", label: "승인 대기" },
  { key: "결제대기", label: "결제 대기" },
  { key: "결제완료", label: "결제 완료" },
  { key: "승인", label: "승인" },
  { key: "거절", label: "거절" },
  { key: "취소", label: "취소" },
  { key: "환불", label: "환불" },
];

type SortKey = "student" | "teacher" | "start" | "applied";

const SORT_VALUE: Record<SortKey, (r: AdminEnrollment) => string> = {
  student: (r) => r.student_name ?? "",
  teacher: (r) => r.teacher_name ?? "",
  start: (r) => r.start_date,
  applied: (r) => r.created_at,
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

// 결제 일시(날짜 + 시:분).
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 결제 수단 라벨.
function payMethodLabel(method: string | null | undefined): string {
  if (method === "bank_transfer") return "무통장 입금";
  if (method === "card") return "카드";
  return method ?? "카드";
}

export default function EnrollmentsManager({ enrollments }: { enrollments: AdminEnrollment[] }) {
  const [rows, setRows] = useState(enrollments);
  // router.refresh() 후 새 prop(테스트 신청 생성 등)을 로컬 rows에 동기화 — 전체 새로고침 없이 목록 반영.
  useEffect(() => setRows(enrollments), [enrollments]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("전체");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const toggleSort = (key: SortKey) => setSort((prev) => (prev?.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const counts = useMemo(() => {
    const c: Record<string, number> = { 전체: rows.length, 신청: 0, 결제대기: 0, 결제완료: 0, 승인: 0, 거절: 0, 취소: 0, 환불: 0 };
    // 환불(취소+환불결제)은 '취소' 카운트에서 분리해 별도 집계.
    for (const r of rows) {
      if (isRefunded(r)) c["환불"] += 1;
      else c[r.status] = (c[r.status] ?? 0) + 1;
    }
    return c;
  }, [rows]);

  // 같은 강사(teacher_id) 내 진행중(신청/승인/결제대기) 신청끼리 시간이 겹치는 행 id 집합.
  // 전체 rows 기준으로 계산(상태 필터로 상대 행이 가려져도 충돌 표시는 유지).
  const conflictIds = useMemo(() => {
    const active = new Set<StatusKey>(["신청", "승인", "결제대기", "결제완료"]);
    return overlappingIds(rows.filter((r) => active.has(r.status)).map((r) => ({ id: r.id, group: r.teacher_id, slots: r.slots })));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = rows.filter((r) => {
      // 환불 탭=환불 건만, 취소 탭=환불 아닌 순수 취소만, 그 외 상태 탭=상태 일치(환불 제외).
      if (filter === "환불") {
        if (!isRefunded(r)) return false;
      } else if (filter === "취소") {
        if (r.status !== "취소" || isRefunded(r)) return false;
      } else if (filter !== "전체" && r.status !== filter) {
        return false;
      }
      if (!q) return true;
      return `${r.student_name ?? ""} ${r.teacher_name ?? ""} ${r.course_title}`.toLowerCase().includes(q);
    });
    if (!sort) return base;
    const val = (r: AdminEnrollment) => SORT_VALUE[sort.key](r).trim();
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

      <div className="border-rule mt-4 overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-rule bg-surface text-muted-fg-faint border-b text-left text-xs font-semibold">
              <th className="px-4 py-2.5 md:px-6">상태</th>
              <SortHeader label="학생" sortKey="student" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
              <SortHeader label="강사" sortKey="teacher" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
              <th className="px-4 py-2.5">과정</th>
              <SortHeader label="시작일" sortKey="start" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
              <SortHeader label="신청일" sortKey="applied" sort={sort} onSort={toggleSort} className="px-4 py-2.5 md:px-6" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-muted-fg px-6 py-12 text-center text-sm">
                  표시할 수강신청이 없습니다.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
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
                    )}
                  >
                    <td className="px-4 py-3.5 align-middle md:px-6">
                      <div className="flex flex-col items-start gap-1.5">
                        <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold", isRefunded(r) ? REFUND_BADGE : STATUS_BADGE[r.status])}>
                          {isRefunded(r) ? "환불" : r.status}
                        </span>
                        {r.is_test && <span className="bg-accent-blue-soft text-accent-blue-ink shrink-0 rounded-full px-2 py-0.5 text-xs font-bold">테스트</span>}
                        {conflict && (
                          <span
                            className="bg-brand inline-flex w-fit shrink-0 animate-pulse items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold text-white"
                            title="같은 강사의 다른 진행중 신청과 시간이 겹칩니다."
                          >
                            <TriangleAlert className="size-3" aria-hidden /> 시간 겹침
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="text-ink max-w-[12rem] truncate px-4 py-3.5 align-middle font-bold">{r.student_name ?? "학생"}</td>
                    <td className="text-muted-fg max-w-[12rem] truncate px-4 py-3.5 align-middle">{r.teacher_name ?? "강사"}</td>
                    <td className="text-muted-fg max-w-[12rem] truncate px-4 py-3.5 align-middle">{r.course_title}</td>
                    <td className="text-ink px-4 py-3.5 align-middle whitespace-nowrap">
                      <span className="block">{r.start_date}</span>
                      {r.slots.length > 0 && <span className="text-muted-fg-faint mt-0.5 block text-xs font-medium">{summarizeSlots(r.slots, true)}</span>}
                    </td>
                    <td className="text-muted-fg-faint px-4 py-3.5 align-middle whitespace-nowrap md:px-6">{formatDate(r.created_at)}</td>
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
          onDeleted={(id) => setRows((prev) => prev.filter((x) => x.id !== id))}
        />
      )}
    </div>
  );
}

function EnrollmentDetailModal({
  enrollment: row,
  conflict,
  onClose,
  onUpdated,
  onDeleted,
}: {
  enrollment: AdminEnrollment;
  conflict: boolean;
  onClose: () => void;
  onUpdated: (updated: AdminEnrollment) => void;
  onDeleted: (id: string) => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [payConfirmOpen, setPayConfirmOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundAmountStr, setRefundAmountStr] = useState("");
  const [pending, startTransition] = useTransition();
  const cancellable = row.status === "신청" || row.status === "승인" || row.status === "결제대기";
  const payable = row.status === "결제대기"; // 입금 확인 → 결제완료
  const pay = row.payment;
  const refundable = row.status === "결제완료" && pay?.status === "paid"; // 결제 환불 가능(카드/무통장)
  const paidRemaining = pay ? (pay.amount ?? 0) - (pay.cancelledAmount ?? 0) : 0;
  const isBankPay = pay?.method === "bank_transfer" || pay?.paymentId?.startsWith("bank-"); // 무통장=PG 취소 불가, 계좌 수동 송금

  // Esc 닫기(확인창 열림 시 무시) + body scroll lock + 닫기 버튼 포커스.
  const confirmingRef = useRef(false);
  confirmingRef.current = confirmOpen || payConfirmOpen || deleteOpen || refundOpen;
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
        onClose();
      } else {
        toast.error(res.error ?? "취소 중 문제가 발생했어요.");
      }
    });
  };

  const confirmPay = () => {
    setPayConfirmOpen(false);
    startTransition(async () => {
      const res = await confirmPayment(row.id);
      if (res.ok) {
        onUpdated({ ...row, status: "결제완료" });
        toast.success("결제를 확인했어요. 학생에게 확정 문자가 발송됩니다.");
        onClose();
      } else {
        toast.error(res.error ?? "결제 확인 중 문제가 발생했어요.");
      }
    });
  };

  const askRefund = () => {
    if (!refundReason.trim()) {
      toast.error("환불 사유를 입력해 주세요.");
      return;
    }
    const amt = refundAmountStr.trim() ? Number(refundAmountStr) : paidRemaining;
    if (!Number.isFinite(amt) || amt <= 0 || amt > paidRemaining) {
      toast.error(`환불 금액은 1~${paidRemaining.toLocaleString()}원 사이여야 합니다.`);
      return;
    }
    setRefundOpen(true);
  };

  const doRefund = () => {
    setRefundOpen(false);
    const amt = refundAmountStr.trim() ? Math.floor(Number(refundAmountStr)) : undefined; // 미입력=잔액 전액
    startTransition(async () => {
      const res = await refundPayment(row.id, { reason: refundReason.trim(), amount: amt });
      if (res.ok) {
        const refunded = amt ?? paidRemaining;
        const partial = refunded < paidRemaining;
        onUpdated({
          ...row,
          status: "취소",
          payment: pay ? { ...pay, status: partial ? "partial_cancelled" : "cancelled", cancelledAmount: (pay.cancelledAmount ?? 0) + refunded } : pay,
        });
        toast.success("환불 처리했어요. 학생에게 안내 문자가 발송됩니다.");
        onClose();
      } else {
        toast.error(res.error ?? "환불 중 문제가 발생했어요.");
      }
    });
  };

  const deleteTest = () => {
    setDeleteOpen(false);
    startTransition(async () => {
      const res = await deleteTestEnrollment(row.id);
      if (res.ok) {
        onDeleted(row.id);
        toast.success("테스트 수강신청을 삭제했어요.");
        onClose();
      } else {
        toast.error(res.error ?? "삭제 중 문제가 발생했어요.");
      }
    });
  };

  const studentLabel = row.student_name ?? "학생";

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
            <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold", isRefunded(row) ? REFUND_BADGE : STATUS_BADGE[row.status])}>
              {isRefunded(row) ? "환불" : row.status}
            </span>
            <h2 className="text-ink truncate text-lg font-bold">
              {studentLabel}
              <span className="text-muted-fg-faint font-normal"> → {row.teacher_name ?? "강사"}</span>
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
          {conflict && (
            <p className="mb-4 inline-flex items-center gap-1.5 rounded-md bg-[#FFF7E6] px-2.5 py-1.5 text-xs font-semibold text-[#B97400]">
              <TriangleAlert className="size-3.5 shrink-0" aria-hidden /> 같은 강사의 다른 진행중 신청과 수업 시간이 겹칩니다.
            </p>
          )}
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm">
            {[
              ["학생", row.student_name ?? "-"],
              ["전화", row.student_phone ?? "-"],
              ["강사", row.teacher_name ?? "-"],
              ["과정", row.course_title],
              ["수강료", row.priceLabel || "-"],
              ["수업 일정", summarizeSlots(row.slots)],
              ["시작일", row.start_date],
              ...(pay ? ([["결제 수단", payMethodLabel(pay.method)]] as [string, string][]) : []),
              ...(pay?.createdAt ? ([["결제 일시", formatDateTime(pay.createdAt)]] as [string, string][]) : []),
              ...(row.teacher_note ? ([["메모/사유", row.teacher_note]] as [string, string][]) : []),
            ].map(([label, value]) => (
              <div key={label} className="flex gap-2">
                <dt className="text-muted-fg-faint w-24 shrink-0">{label}</dt>
                <dd className="text-ink break-words whitespace-pre-wrap">{value}</dd>
              </div>
            ))}
            {pay?.receiptUrl && (
              <div className="flex gap-2">
                <dt className="text-muted-fg-faint w-24 shrink-0">영수증</dt>
                <dd>
                  <a
                    href={pay.receiptUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent-blue-ink hover:text-accent-blue inline-flex items-center gap-1 font-semibold"
                  >
                    <ExternalLink className="size-3.5" aria-hidden />
                    영수증 보기
                  </a>
                </dd>
              </div>
            )}
          </dl>

          {cancellable ? (
            <div className="mt-5">
              <label className="text-muted-fg-faint mb-1 block text-xs font-semibold">취소 사유 (학생에게 문자로 전송됩니다)</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="강제 취소 사유를 입력하세요..."
                className="border-rule-faint focus:border-accent-blue w-full rounded-md border bg-white px-3 py-2 text-sm outline-none"
              />
            </div>
          ) : refundable ? (
            <div className="mt-5">
              <label className="text-muted-fg-faint mb-1 block text-xs font-semibold">환불 사유 (학생에게 문자로 전송됩니다)</label>
              <textarea
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                rows={2}
                placeholder="환불 사유를 입력하세요..."
                className="border-rule-faint focus:border-accent-blue w-full rounded-md border bg-white px-3 py-2 text-sm outline-none"
              />
              <label className="text-muted-fg-faint mt-3 mb-1 block text-xs font-semibold">환불 금액 (비우면 전액 ₩{paidRemaining.toLocaleString()})</label>
              <input
                type="number"
                value={refundAmountStr}
                onChange={(e) => setRefundAmountStr(e.target.value)}
                min={1}
                max={paidRemaining}
                placeholder={String(paidRemaining)}
                className="border-rule-faint focus:border-accent-blue w-40 rounded-md border bg-white px-3 py-2 text-sm outline-none"
              />
              <p className="text-muted-fg-faint mt-1.5 text-xs">환불 시 수강이 취소되고 남은(예정) 수업이 모두 취소됩니다.</p>
              {isBankPay && (
                <p className="text-brand mt-2 rounded-md bg-brand/5 px-3 py-2 text-xs font-semibold">
                  무통장 입금 건입니다. 실제 환불 금액은 학생 계좌로 직접 송금해 주세요(시스템은 수강 취소·기록만 처리합니다).
                </p>
              )}
            </div>
          ) : (
            <div className="mt-5">
              <p className="text-muted-fg text-sm">처리 완료된 신청입니다(읽기 전용).</p>
              {pay && (pay.status === "cancelled" || pay.status === "partial_cancelled") && (
                <p className="text-brand mt-1 text-xs font-semibold">
                  환불됨: ₩{(pay.cancelledAmount ?? 0).toLocaleString()}
                  {pay.status === "partial_cancelled" ? " (부분)" : ""}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="border-rule flex items-center justify-between gap-2 border-t px-6 py-4">
          <div>
            {row.is_test && (
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                disabled={pending}
                className="border-brand/40 text-brand hover:bg-brand/5 inline-flex h-9 items-center gap-1.5 rounded-md border px-4 text-sm font-bold transition-colors disabled:opacity-50"
              >
                {pending && <Loader2 className="size-3.5 animate-spin" />}
                테스트 삭제
              </button>
            )}
          </div>
          <div className="flex gap-2">
          {cancellable ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="border-rule text-muted-fg hover:bg-surface rounded-md border px-4 py-2 text-sm font-bold transition-colors"
              >
                닫기
              </button>
              {payable && (
                <button
                  type="button"
                  onClick={() => setPayConfirmOpen(true)}
                  disabled={pending}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-transparent bg-[#1E7E34] px-4 text-sm font-bold text-white transition-colors hover:bg-[#1A6E2E] disabled:opacity-50"
                >
                  {pending && <Loader2 className="size-3.5 animate-spin" />}
                  결제 확인
                </button>
              )}
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
            <>
              <button
                type="button"
                onClick={onClose}
                className="border-rule text-muted-fg hover:bg-surface rounded-md border px-4 py-2 text-sm font-bold transition-colors"
              >
                닫기
              </button>
              {refundable && (
                <button
                  type="button"
                  onClick={askRefund}
                  disabled={pending}
                  className="border-brand/40 text-brand hover:bg-brand/5 inline-flex h-9 items-center gap-1.5 rounded-md border px-4 text-sm font-bold transition-colors disabled:opacity-50"
                >
                  {pending && <Loader2 className="size-3.5 animate-spin" />}
                  환불
                </button>
              )}
            </>
          )}
          </div>
        </div>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="z-[130]">
          <AlertDialogHeader>
            <AlertDialogTitle>이 테스트 수강신청을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="text-ink font-semibold">{studentLabel}</span>님의 {row.course_title} 테스트 신청과 생성된 수업이 모두 영구 삭제됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>돌아가기</AlertDialogCancel>
            <AlertDialogAction onClick={deleteTest} className="bg-brand hover:bg-brand/90 border-transparent text-white">
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="z-[130]">
          <AlertDialogHeader>
            <AlertDialogTitle>이 수강신청을 강제 취소할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="text-ink font-semibold">{studentLabel}</span>님의 {row.course_title} 신청이 취소되며, 입력한 사유가 문자로 전송됩니다.
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

      <AlertDialog open={refundOpen} onOpenChange={setRefundOpen}>
        <AlertDialogContent className="z-[130]">
          <AlertDialogHeader>
            <AlertDialogTitle>이 결제를 환불할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="text-ink font-semibold">{studentLabel}</span>님의 {row.course_title}{" "}
              {isBankPay ? "무통장 입금 건이 환불 처리되고," : "결제가 PortOne에서 취소되고,"}{" "}
              <span className="text-ink font-semibold">수강이 취소</span>되며 남은 예정 수업이 모두 취소됩니다. 학생에게 안내 문자가 전송됩니다.
              <span className="text-ink mt-2 block font-semibold">
                환불 금액: ₩{(refundAmountStr.trim() ? Math.floor(Number(refundAmountStr)) : paidRemaining).toLocaleString()}
                {refundAmountStr.trim() && Math.floor(Number(refundAmountStr)) < paidRemaining ? " (부분)" : ""}
              </span>
              {isBankPay && <span className="text-brand mt-1 block text-xs">실제 환불금은 계좌로 직접 송금해 주세요.</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>돌아가기</AlertDialogCancel>
            <AlertDialogAction onClick={doRefund} className="bg-brand hover:bg-brand/90 border-transparent text-white">
              환불 처리
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={payConfirmOpen} onOpenChange={setPayConfirmOpen}>
        <AlertDialogContent className="z-[130]">
          <AlertDialogHeader>
            <AlertDialogTitle>입금을 확인하고 결제완료로 처리할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="text-ink font-semibold">{studentLabel}</span>님의 {row.course_title} 수업이 확정되며, 학생에게 확정 문자가 전송됩니다.
              {row.priceLabel && (
                <span className="text-ink mt-2 block font-semibold">입금 확인 금액: {row.priceLabel}</span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>돌아가기</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPay} className="border-transparent bg-[#1E7E34] text-white hover:bg-[#1A6E2E]">
              결제 확인
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
