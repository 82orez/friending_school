"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fmtDateKo, formatWon } from "@/lib/prep";
import { formatPhone } from "@/lib/phone";
import { kstDateText } from "@/lib/kst";
import {
  PREP_ENROLLMENT_BADGE,
  PREP_ENROLLMENT_LABEL,
  PREP_ENROLLMENT_STATUSES,
  PREP_REFUND_BADGE,
  PREP_REFUND_LABEL,
  type PrepEnrollmentStatus,
} from "@/data/prep";
import { cancelPrepEnrollmentAsAdmin, confirmPrepPayment, refundPrepEnrollment } from "@/app/admin/actions";
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

// 한 행 = 신청 하나. 금액·회차·강좌명은 **신청 시점 스냅샷**이라 강좌 원본과 다를 수 있다(중도 신청 = 잔여 비례).
export type AdminPrepEnrollmentRow = {
  id: string;
  course_id: string;
  course_title: string; // 신청 시점 강좌명 스냅샷
  student_name: string | null;
  student_phone: string | null;
  price_krw: number;
  session_count: number;
  first_session_date: string | null;
  last_session_date: string | null;
  status: PrepEnrollmentStatus;
  paid_at: string | null;
  cancelled_at: string | null;
  admin_note: string | null;
  created_at: string;
  courseLabel: string; // 강좌 현재 이름(없으면 스냅샷)
  friender: string;
  isMidjoin: boolean;
  /** 결제 원본 금액(payments.amount). 기록이 없으면 신청 스냅샷 price_krw. */
  paidKrw: number;
  /** 환불 누적액(payments.cancelled_amount). 0이면 환불 이력 없음. */
  refundedKrw: number;
};

export type PrepCourseOption = { id: string; label: string; friender: string };

const PER_PAGE = 25;

type FilterKey = "전체" | PrepEnrollmentStatus;
const FILTERS: FilterKey[] = ["전체", ...PREP_ENROLLMENT_STATUSES];

type SortKey = "created" | "student" | "course" | "price" | "status" | "paid";

// ⚠️ 전부 문자열 비교라 숫자는 zero-pad 필수(안 하면 9,000 > 19,000이 된다).
const SORT_VALUE: Record<SortKey, (r: AdminPrepEnrollmentRow) => string> = {
  created: (r) => r.created_at,
  student: (r) => r.student_name ?? "",
  course: (r) => r.courseLabel,
  price: (r) => String(r.price_krw).padStart(12, "0"),
  status: (r) => r.status,
  paid: (r) => r.paid_at ?? "",
};

function StatCard({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="border-rule rounded-xl border bg-white p-5">
      <p className="text-muted-fg-faint text-xs font-semibold">{label}</p>
      <p className={cn("mt-1 text-2xl font-extrabold", tone ?? "text-ink")}>{value}</p>
      <p className="text-muted-fg-faint mt-0.5 text-xs">{sub}</p>
    </div>
  );
}

// 프렙 수강신청 관리 — 무통장 입금 확인이 관리자 몫이라 강좌를 넘나들며 처리할 화면이 필요하다.
// 액션은 기존 서버 액션(confirmPrepPayment · cancelPrepEnrollmentAsAdmin)을 그대로 쓴다.
export default function PrepEnrollmentsManager({
  rows: initialRows,
  courses,
  initialCourseId,
}: {
  rows: AdminPrepEnrollmentRow[];
  courses: PrepCourseOption[];
  initialCourseId: string;
}) {
  const [rows, setRows] = useState(initialRows);
  useEffect(() => setRows(initialRows), [initialRows]); // router.refresh() / revalidate 후 동기화

  const [query, setQuery] = useState("");
  // 기본은 '입금 대기' — 이 화면의 일은 입금 대조다(/admin/prep이 '신청'(심사 대기)으로 여는 것과 같은 이유).
  // 강좌 딥링크(?course=)로 들어와도 같다: 진입 경로마다 기본 뷰가 달라지지 않는다.
  const [filter, setFilter] = useState<FilterKey>("입금대기");
  const [courseId, setCourseId] = useState(initialCourseId);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const [page, setPage] = useState(1);

  const [payTarget, setPayTarget] = useState<AdminPrepEnrollmentRow | null>(null);
  const [cancelTarget, setCancelTarget] = useState<AdminPrepEnrollmentRow | null>(null);
  // 환불은 입금이 확인된 건 전용 — 금액·사유가 payments/admin_note에 남는다.
  const [refundTarget, setRefundTarget] = useState<AdminPrepEnrollmentRow | null>(null);
  const [refundAmount, setRefundAmount] = useState(""); // 문자열 controlled(숫자만) — 빈 값 허용해 지우고 다시 칠 수 있게
  const [reason, setReason] = useState(""); // 취소는 선택 입력, 환불은 필수 — 둘 다 신청자 SMS에 사유로 붙는다
  const [busy, startBusy] = useTransition();

  // 통계는 **강좌 필터까지만** 반영한다(상태 pill로 좁힌 값이 카드에 다시 반영되면 합계를 못 읽는다).
  const scoped = useMemo(() => (courseId === "all" ? rows : rows.filter((r) => r.course_id === courseId)), [rows, courseId]);
  const stats = useMemo(() => {
    const sum = (s: PrepEnrollmentStatus) => scoped.filter((r) => r.status === s).reduce((a, r) => a + r.price_krw, 0);
    const cnt = (s: PrepEnrollmentStatus) => scoped.filter((r) => r.status === s).length;
    return {
      waiting: cnt("입금대기"),
      waitingWon: sum("입금대기"),
      paid: cnt("수강확정"),
      paidWon: sum("수강확정"),
      cancelled: cnt("취소"),
      // 환불은 별도 상태가 아니라 '취소' 안에 섞여 있다 — 돌려준 돈의 합계는 따로 보여 준다.
      refundedWon: scoped.reduce((a, r) => a + (r.refundedKrw ?? 0), 0),
    };
  }, [scoped]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { 전체: scoped.length };
    for (const s of PREP_ENROLLMENT_STATUSES) c[s] = scoped.filter((r) => r.status === s).length;
    return c;
  }, [scoped]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    const base = scoped.filter((r) => {
      if (filter !== "전체" && r.status !== filter) return false;
      if (!q) return true;
      // 이름·강좌·프렌더는 텍스트로, 전화는 숫자만 남겨 비교한다(010-9883-0288을 '9883'으로도 찾게).
      if (`${r.student_name ?? ""} ${r.courseLabel} ${r.course_title} ${r.friender}`.toLowerCase().includes(q)) return true;
      return !!qDigits && !!r.student_phone && r.student_phone.replace(/\D/g, "").includes(qDigits);
    });
    if (!sort) return base;
    const val = (r: AdminPrepEnrollmentRow) => SORT_VALUE[sort.key](r).trim();
    return [...base].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (!av && !bv) return 0;
      if (!av) return 1; // 빈 값은 방향과 무관하게 뒤로
      if (!bv) return -1;
      const cmp = av.localeCompare(bv, "ko");
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [scoped, query, filter, sort]);

  // 조건이 바뀌면 보고 있던 페이지 번호는 의미가 없다.
  useEffect(() => setPage(1), [query, filter, courseId, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const current = Math.min(page, totalPages);
  const from = (current - 1) * PER_PAGE;
  const pageRows = filtered.slice(from, from + PER_PAGE);

  const toggleSort = (key: SortKey) =>
    setSort((prev) => (prev?.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const patchRow = (id: string, patch: Partial<AdminPrepEnrollmentRow>) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  // 다이얼로그를 닫으며 state를 비우므로 대상·사유를 먼저 스냅샷한다(프렙 관리 화면 공통 패턴).
  const confirmPay = () => {
    const target = payTarget;
    setPayTarget(null);
    if (!target) return;
    startBusy(async () => {
      const res = await confirmPrepPayment(target.id);
      if (res.ok) {
        patchRow(target.id, { status: "수강확정", paid_at: new Date().toISOString() });
        toast.success("입금을 확인해 수강을 확정했습니다.");
      } else {
        toast.error(res.error ?? "오류가 발생했습니다.");
      }
    });
  };

  const confirmCancel = () => {
    const target = cancelTarget;
    const note = reason.trim();
    setCancelTarget(null);
    setReason("");
    if (!target) return;
    startBusy(async () => {
      const res = await cancelPrepEnrollmentAsAdmin(target.id, note);
      if (res.ok) {
        patchRow(target.id, { status: "취소", cancelled_at: new Date().toISOString() });
        toast.success("신청을 취소 처리했습니다.");
      } else {
        toast.error(res.error ?? "오류가 발생했습니다.");
      }
    });
  };

  // 환불 — 입력 금액은 0 < n <= 환불 가능액이어야 하고 사유는 필수다(서버도 같은 검증을 한다).
  const refundable = refundTarget ? refundTarget.paidKrw - refundTarget.refundedKrw : 0;
  const refundNum = Number(refundAmount);
  const refundValid = Number.isFinite(refundNum) && refundNum > 0 && refundNum <= refundable && reason.trim().length > 0;

  const confirmRefund = () => {
    const target = refundTarget;
    const amount = refundNum;
    const note = reason.trim();
    setRefundTarget(null);
    setRefundAmount("");
    setReason("");
    if (!target) return;
    startBusy(async () => {
      const res = await refundPrepEnrollment(target.id, amount, note);
      if (res.ok) {
        patchRow(target.id, { status: "취소", cancelled_at: new Date().toISOString(), refundedKrw: target.refundedKrw + amount });
        toast.success(`${formatWon(amount)}을 환불 처리했습니다.`);
      } else {
        toast.error(res.error ?? "오류가 발생했습니다.");
      }
    });
  };

  return (
    <div>
      <h1 className="text-ink text-2xl font-extrabold">프렙 수강신청 관리</h1>
      <p className="text-muted-fg mt-1 text-sm">
        전 강좌의 프렙 수강신청입니다. 무통장 입금을 확인해 수강을 확정하고, 미입금 건은 취소·입금된 건은 환불 처리합니다.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="입금 대기" value={`${stats.waiting}건`} sub={`미입금 ${formatWon(stats.waitingWon)}`} tone="text-[#B97400]" />
        <StatCard label="수강 확정" value={`${stats.paid}건`} sub={`입금 확인 ${formatWon(stats.paidWon)}`} tone="text-[#0F6E56]" />
        <StatCard label="취소" value={`${stats.cancelled}건`} sub={`환불 ${formatWon(stats.refundedWon)} 포함`} />
      </div>

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
              )}>
              {f === "전체" ? "전체" : PREP_ENROLLMENT_LABEL[f]}{" "}
              <span className={cn("ml-0.5", active ? "text-white/70" : "text-muted-fg-faint")}>{counts[f] ?? 0}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <div className="border-rule flex flex-1 items-center gap-2 rounded-lg border bg-white px-3">
          <Search className="text-muted-fg-faint size-4" aria-hidden />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="학생·연락처·강좌 검색..."
            className="h-10 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        <label className="sm:w-[280px]">
          <span className="sr-only">강좌 선택</span>
          <select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            className="border-rule focus:border-accent-blue h-10 w-full rounded-lg border bg-white px-3 text-sm outline-none">
            <option value="all">전체 강좌 ({rows.length}건)</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} · {c.friender}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="border-rule mt-4 overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead>
            <tr className="border-rule bg-surface text-muted-fg-faint border-b text-left text-xs font-semibold">
              <SortHeader label="상태" sortKey="status" sort={sort} onSort={toggleSort} className="px-4 py-2.5 md:px-6" />
              <SortHeader label="신청일" sortKey="created" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
              <SortHeader label="학생" sortKey="student" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
              <th className="px-4 py-2.5">연락처</th>
              <SortHeader label="강좌" sortKey="course" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
              <SortHeader label="금액" sortKey="price" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
              <SortHeader label="입금 확인" sortKey="paid" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
              <th className="px-4 py-2.5 md:px-6">
                <span className="sr-only">액션</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-muted-fg px-6 py-12 text-center text-sm">
                  표시할 수강신청이 없습니다.
                </td>
              </tr>
            ) : (
              pageRows.map((r) => (
                <tr key={r.id} className={cn("border-rule border-b last:border-b-0", r.status === "취소" && "opacity-60")}>
                  <td className="px-4 py-3.5 align-middle md:px-6">
                    {/* 환불은 DB 상태가 아니라 파생 표시다 — '취소' 중 환불 기록이 있는 건(돈이 오갔던 건)을 갈라 보여 준다. */}
                    {r.status === "취소" && r.refundedKrw > 0 ? (
                      <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap", PREP_REFUND_BADGE)}>
                        {PREP_REFUND_LABEL}
                      </span>
                    ) : (
                      <span
                        className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap", PREP_ENROLLMENT_BADGE[r.status])}>
                        {PREP_ENROLLMENT_LABEL[r.status]}
                      </span>
                    )}
                  </td>
                  <td className="text-muted-fg px-4 py-3.5 align-middle text-xs whitespace-nowrap">{kstDateText(r.created_at)}</td>
                  <td className="text-ink max-w-[10rem] truncate px-4 py-3.5 align-middle font-semibold">{r.student_name ?? "(이름 없음)"}</td>
                  <td className="text-muted-fg px-4 py-3.5 align-middle whitespace-nowrap">{r.student_phone ? formatPhone(r.student_phone) : "-"}</td>
                  <td className="px-4 py-3.5 align-middle">
                    <p className="text-ink max-w-[16rem] truncate">{r.courseLabel}</p>
                    <p className="text-muted-fg-faint text-xs">
                      {r.friender}
                      {r.first_session_date && ` · 첫 수업 ${fmtDateKo(r.first_session_date)}`}
                    </p>
                  </td>
                  {/* 입금 대조 기준 금액 — 중도 신청자는 잔여 회차만큼만 결제하므로 강좌 정가와 다르다. */}
                  <td className="text-ink px-4 py-3.5 align-middle font-semibold whitespace-nowrap">
                    {formatWon(r.price_krw)}
                    {r.isMidjoin && <span className="text-brand"> · 중도 {r.session_count}회</span>}
                    {r.refundedKrw > 0 && <span className="text-[#B45309]"> · 환불 {formatWon(r.refundedKrw)}</span>}
                  </td>
                  <td className="text-muted-fg px-4 py-3.5 align-middle text-xs whitespace-nowrap">{r.paid_at ? kstDateText(r.paid_at) : "-"}</td>
                  <td className="px-4 py-3.5 align-middle md:px-6">
                    {/* 미입금은 '신청 취소', 입금이 확인된 건은 '환불 처리' — 돈이 오간 건을 기록 없이 취소하지 않게 경로를 가른다. */}
                    {r.status !== "취소" && (
                      <span className="flex shrink-0 justify-end gap-1.5">
                        {r.status === "입금대기" ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setPayTarget(r)}
                              disabled={busy}
                              className="bg-cta hover:bg-cta/90 rounded-md px-3 py-1.5 text-xs font-bold whitespace-nowrap text-white transition-colors disabled:opacity-60">
                              입금 확인
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setReason("");
                                setCancelTarget(r);
                              }}
                              disabled={busy}
                              className="border-brand/40 text-brand hover:bg-brand/5 rounded-md border px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-colors disabled:opacity-60">
                              신청 취소
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setReason("");
                              // 기본값은 잔여 전액 — 대부분 전액 환불이고, 부분 환불만 손으로 고친다.
                              setRefundAmount(String(Math.max(0, r.paidKrw - r.refundedKrw)));
                              setRefundTarget(r);
                            }}
                            disabled={busy}
                            className="border-brand/40 text-brand hover:bg-brand/5 rounded-md border px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-colors disabled:opacity-60">
                            환불 처리
                          </button>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-fg-faint text-xs">
            전체 {filtered.length}건 중 {from + 1}–{from + pageRows.length}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage(current - 1)}
                disabled={current === 1}
                aria-label="이전 페이지"
                className="border-rule text-muted-fg hover:text-ink rounded-md border bg-white px-2 py-1.5 disabled:opacity-40">
                <ChevronLeft className="size-4" aria-hidden />
              </button>
              {totalPages <= 7 ? (
                Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPage(n)}
                    aria-current={n === current ? "page" : undefined}
                    className={cn(
                      "min-w-8 rounded-md border px-2 py-1.5 text-sm font-medium transition-colors",
                      n === current ? "bg-ink border-ink text-white" : "border-rule text-muted-fg hover:text-ink bg-white",
                    )}>
                    {n}
                  </button>
                ))
              ) : (
                <span className="text-muted-fg px-2 text-sm">
                  {current} / {totalPages}
                </span>
              )}
              <button
                type="button"
                onClick={() => setPage(current + 1)}
                disabled={current === totalPages}
                aria-label="다음 페이지"
                className="border-rule text-muted-fg hover:text-ink rounded-md border bg-white px-2 py-1.5 disabled:opacity-40">
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </div>
          )}
        </div>
      )}

      {/* 입금 확인 */}
      <AlertDialog open={payTarget !== null} onOpenChange={(open) => !open && setPayTarget(null)}>
        <AlertDialogContent className="z-[130]">
          <AlertDialogHeader>
            <AlertDialogTitle>입금을 확인할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {payTarget && (
                <>
                  <span className="text-ink font-semibold">{payTarget.student_name ?? "신청자"}</span>님({formatWon(payTarget.price_krw)})의 수강이
                  확정되고 확정 문자가 발송됩니다.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPay} className="bg-cta hover:bg-cta/90 border-transparent text-white">
              입금 확인
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 신청 취소 */}
      <AlertDialog open={cancelTarget !== null} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent className="z-[130]">
          <AlertDialogHeader>
            <AlertDialogTitle>이 신청을 취소 처리할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget && (
                <>
                  <span className="text-ink font-semibold">{cancelTarget.student_name ?? "신청자"}</span>님의 <b>미입금</b> 신청이 취소되고 문자로
                  통보됩니다. 자리는 다시 비워집니다.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="text-left">
            <label className="flex flex-col gap-1">
              <span className="text-muted-fg-faint text-xs font-semibold">사유 (선택 · 신청자에게 전달됩니다)</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="예) 기한 내 미입금으로 취소합니다."
                className="border-rule focus:border-accent-blue rounded-md border bg-white px-3 py-2 text-sm outline-none"
              />
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>닫기</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancel} variant="brand">
              신청 취소
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 환불 처리 — 입금이 확인된 건 전용. 금액이 payments에 누적되고 수강은 '취소'로 간다. */}
      <AlertDialog open={refundTarget !== null} onOpenChange={(open) => !open && setRefundTarget(null)}>
        <AlertDialogContent className="z-[130]">
          <AlertDialogHeader>
            <AlertDialogTitle>환불 처리할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {refundTarget && (
                <>
                  <span className="text-ink font-semibold">{refundTarget.student_name ?? "신청자"}</span>님 · {refundTarget.courseLabel}
                  <br />
                  결제액 {formatWon(refundTarget.paidKrw)}
                  {refundTarget.refundedKrw > 0 && ` · 기환불 ${formatWon(refundTarget.refundedKrw)}`} · 환불 가능 {formatWon(refundable)}
                  <br />
                  수강이 취소되고 문자로 통보됩니다. <b>실제 송금은 계좌로 직접 처리</b>해 주세요(무통장이라 자동 취소 경로가 없습니다).
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-3 text-left">
            <label className="flex flex-col gap-1">
              <span className="text-muted-fg-faint text-xs font-semibold">환불 금액 (원)</span>
              <input
                type="text"
                inputMode="numeric"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value.replace(/\D/g, ""))}
                className="border-rule focus:border-accent-blue rounded-md border bg-white px-3 py-2 text-sm outline-none"
              />
              {/* 부분 환불은 남은 금액을 payments에 남기지만, 수강 자체는 전액이든 부분이든 취소된다. */}
              <span className="text-muted-fg-faint text-xs">전액 환불이 기본값입니다. 부분 환불이면 금액을 고쳐 주세요.</span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted-fg-faint text-xs font-semibold">환불 사유 (필수 · 신청자에게 전달됩니다)</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="예) 개인 사정으로 수강을 취소하여 전액 환불합니다."
                className="border-rule focus:border-accent-blue rounded-md border bg-white px-3 py-2 text-sm outline-none"
              />
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>닫기</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRefund} disabled={!refundValid} variant="brand">
              환불 처리
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <p className="text-muted-fg-faint mt-4 text-xs">
        강좌 자체의 심사·삭제는{" "}
        <Link href="/admin/prep" className="text-accent-blue-ink underline">
          프렙 강좌
        </Link>{" "}
        탭에서 합니다.
      </p>
    </div>
  );
}

// EnrollmentsManager·MembersManager와 같은 정렬 헤더(공용 컴포넌트가 없어 매니저마다 자립하는 게 이 폴더 관례).
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
