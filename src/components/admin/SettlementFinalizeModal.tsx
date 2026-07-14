"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { CURRENCIES, DEFAULT_CURRENCY, formatPrice, type Rates } from "@/data/currencies";
import {
  confirmCenterSettlement,
  updateCenterSettlement,
  markSettlementPaid,
  reopenSettlement,
  unconfirmCenterSettlement,
} from "@/app/admin/actions";
import type { CenterSettlementRecord, LiveBase } from "@/components/admin/MonthlySettlementSection";
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

type AdjRow = { label: string; amount: string; currency: string };

const todayKstStr = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
// 조정 1건 원화 환산(클라 프리뷰 — 현재 환율. 서버 확정 시 월말 환율로 재스냅샷).
const adjKrwPreview = (amount: number, currency: string, rates: Rates): number =>
  currency === "KRW" ? Math.round(amount) : rates[currency] > 0 ? Math.round(amount * rates[currency]) : 0;

export default function SettlementFinalizeModal({
  center,
  periodMonth,
  monthLabel,
  monthClosed,
  record,
  liveBase,
  rates,
  onClose,
}: {
  center: { id: string; name: string };
  periodMonth: string;
  monthLabel: string;
  monthClosed: boolean;
  record: CenterSettlementRecord | null;
  liveBase: LiveBase;
  rates: Rates;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const confirmed = record != null;
  const paid = record?.status === "지급완료";
  const readOnly = paid; // 지급완료면 금액 편집 잠금

  // 확정본이 있으면 그 스냅샷, 없으면 라이브 프리뷰.
  const base = record
    ? { sessionsCount: record.sessionsCount, baseNative: record.baseNative, baseKrw: record.baseKrw, currency: record.currency }
    : liveBase;

  const [adjustments, setAdjustments] = useState<AdjRow[]>(() =>
    record ? record.adjustments.map((a) => ({ label: a.label, amount: String(a.amount), currency: a.currency })) : [],
  );
  const [override, setOverride] = useState<string>(() => (record ? String(record.totalKrw) : ""));
  const [note, setNote] = useState<string>(record?.note ?? "");
  const [paidAt, setPaidAt] = useState<string>(record?.paidAt ?? todayKstStr());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const adjKrwTotal = useMemo(
    () => adjustments.reduce((s, a) => s + (a.label.trim() && Number(a.amount) ? adjKrwPreview(Number(a.amount), a.currency, rates) : 0), 0),
    [adjustments, rates],
  );
  const autoTotal = base.baseKrw + adjKrwTotal;
  const effectiveTotal = override.trim() !== "" && Number.isFinite(Number(override)) ? Math.round(Number(override)) : autoTotal;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, successMsg: string, close = false) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(successMsg);
        router.refresh();
        if (close) onClose();
      } else {
        toast.error(res.error ?? "오류가 발생했습니다.");
      }
    });

  const payload = () => ({
    adjustments: adjustments
      .filter((a) => a.label.trim() && Number(a.amount))
      .map((a) => ({ label: a.label.trim(), amount: Number(a.amount), currency: a.currency })),
    totalKrwOverride: override.trim() !== "" ? override : null,
    note: note.trim() || null,
  });

  const doConfirm = () => run(() => confirmCenterSettlement(center.id, periodMonth, payload()), "정산을 확정했습니다.", true);
  const doSave = () => (record ? run(() => updateCenterSettlement(record.id, payload()), "정산 내역을 저장했습니다.") : undefined);
  const doPaid = () => (record ? run(() => markSettlementPaid(record.id, paidAt), "지급 완료로 처리했습니다.") : undefined);
  const doReopen = () => (record ? run(() => reopenSettlement(record.id), "확정 상태로 되돌렸습니다.") : undefined);
  const doCancel = () => (record ? run(() => unconfirmCenterSettlement(record.id), "확정을 취소했습니다.", true) : undefined);

  const baseEntries = Object.entries(base.baseNative).filter(([, v]) => v > 0);

  return (
    <>
      <div aria-hidden="true" onClick={onClose} className="fixed inset-0 z-[110] bg-black/40" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="월간 정산 확정"
        className="fixed top-1/2 left-1/2 z-[120] flex max-h-[90vh] w-[min(94vw,600px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        <div className="border-rule flex items-start justify-between border-b px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-ink truncate text-lg font-bold">{center.name}</h2>
            <p className="text-muted-fg-faint mt-0.5 text-xs">
              {monthLabel} 정산
              {confirmed && (
                <span
                  className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${paid ? "bg-[#E6F4EA] text-[#1E7E34]" : "bg-accent-blue-soft text-accent-blue-ink"}`}
                >
                  {record!.status}
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-muted-fg-faint hover:text-ink ml-3 shrink-0 rounded transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-auto px-6 py-5">
          {/* 기본 정산액(스냅샷 또는 라이브) */}
          <div className="border-rule bg-surface rounded-xl border px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-muted-fg-faint text-xs font-semibold">기본 정산액</span>
              <span className="text-ink text-sm">
                진행 수업 <span className="font-bold">{base.sessionsCount}</span>회
              </span>
            </div>
            <div className="text-ink mt-1 text-sm font-semibold">
              {baseEntries.length > 0 ? baseEntries.map(([cur, amt]) => formatPrice(amt, cur)).join(" + ") : "—"}
              <span className="text-muted-fg-faint ml-1.5 font-medium">≈ {formatPrice(base.baseKrw, "KRW")}</span>
            </div>
            {!confirmed && (
              <p className="text-muted-fg-faint mt-1 text-[11px]">확정 시 이 시점의 진행 수업·단가·환율로 금액이 스냅샷되어 잠깁니다.</p>
            )}
          </div>

          {/* 조정 항목 */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-muted-fg-faint text-xs font-semibold">조정 항목 (송금 수수료·보너스 등)</span>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => setAdjustments((p) => [...p, { label: "", amount: "", currency: DEFAULT_CURRENCY }])}
                  className="text-accent-blue-ink hover:text-accent-blue inline-flex items-center gap-1 text-xs font-semibold"
                >
                  <Plus className="size-3.5" /> 항목 추가
                </button>
              )}
            </div>
            {adjustments.length === 0 ? (
              <p className="text-muted-fg-faint text-xs">조정 항목 없음</p>
            ) : (
              <div className="flex flex-col gap-2">
                {adjustments.map((a, i) => {
                  const krw = a.label.trim() && Number(a.amount) ? adjKrwPreview(Number(a.amount), a.currency, rates) : 0;
                  return (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={a.label}
                        disabled={readOnly}
                        onChange={(e) => setAdjustments((p) => p.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                        placeholder="예: 송금 수수료"
                        className="border-rule-faint focus:border-accent-blue h-9 min-w-[8rem] flex-1 rounded-md border bg-white px-2 text-sm outline-none disabled:opacity-60"
                      />
                      <input
                        type="number"
                        value={a.amount}
                        disabled={readOnly}
                        onChange={(e) => setAdjustments((p) => p.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                        placeholder="금액(±)"
                        className="border-rule-faint focus:border-accent-blue h-9 w-24 rounded-md border bg-white px-2 text-sm outline-none disabled:opacity-60"
                      />
                      <select
                        value={a.currency}
                        disabled={readOnly}
                        onChange={(e) => setAdjustments((p) => p.map((x, j) => (j === i ? { ...x, currency: e.target.value } : x)))}
                        className="border-rule-faint focus:border-accent-blue h-9 rounded-md border bg-white px-1.5 text-sm outline-none disabled:opacity-60"
                      >
                        {CURRENCIES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.symbol} {c.code}
                          </option>
                        ))}
                      </select>
                      <span className="text-muted-fg-faint w-24 text-right text-xs tabular-nums">≈ {formatPrice(krw, "KRW")}</span>
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => setAdjustments((p) => p.filter((_, j) => j !== i))}
                          aria-label="항목 삭제"
                          className="text-muted-fg-faint hover:text-brand shrink-0 rounded p-1 transition-colors"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 실지급액(원화) */}
          <div className="border-rule rounded-xl border px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-muted-fg-faint text-xs font-semibold">실지급액 (원화 환산 기준)</span>
              <span className="text-ink text-lg font-extrabold">{formatPrice(effectiveTotal, "KRW")}</span>
            </div>
            <p className="text-muted-fg-faint mt-1 text-[11px]">
              자동 = 기본 {formatPrice(base.baseKrw, "KRW")} {adjKrwTotal >= 0 ? "+" : "−"} 조정 {formatPrice(Math.abs(adjKrwTotal), "KRW")} ={" "}
              {formatPrice(autoTotal, "KRW")}
            </p>
            {!readOnly && (
              <div className="mt-2 flex items-center gap-2">
                <label className="text-muted-fg-faint text-[11px] font-semibold">수기 보정(원)</label>
                <input
                  type="number"
                  value={override}
                  onChange={(e) => setOverride(e.target.value)}
                  placeholder={String(autoTotal)}
                  className="border-rule-faint focus:border-accent-blue h-9 w-36 rounded-md border bg-white px-2 text-sm outline-none"
                />
                {override.trim() !== "" && (
                  <button type="button" onClick={() => setOverride("")} className="text-muted-fg-faint hover:text-ink text-xs">
                    자동값 사용
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 메모 */}
          <div>
            <label className="text-muted-fg-faint mb-1 block text-xs font-semibold">메모</label>
            <textarea
              value={note}
              disabled={readOnly}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="정산 관련 메모(선택)"
              className="border-rule-faint focus:border-accent-blue w-full resize-none rounded-md border bg-white px-2 py-1.5 text-sm outline-none disabled:opacity-60"
            />
          </div>

          {paid && record?.paidAt && <p className="text-muted-fg text-xs">송금일: {record.paidAt}</p>}

          {!confirmed && !monthClosed && <p className="text-brand text-xs">아직 마감 전인 달이라 확정할 수 없습니다(월말 이후 가능).</p>}

          {/* 액션 */}
          <div className="border-rule flex flex-wrap items-center gap-2 border-t pt-4">
            {!confirmed && (
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                disabled={pending || base.sessionsCount === 0 || !monthClosed}
                className="bg-cta inline-flex h-10 items-center gap-1.5 rounded-md px-5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {pending && <Loader2 className="size-4 animate-spin" />}
                정산 확정
              </button>
            )}
            {confirmed && !paid && (
              <>
                <button
                  type="button"
                  onClick={doSave}
                  disabled={pending}
                  className="bg-ink inline-flex h-10 items-center gap-1.5 rounded-md px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {pending && <Loader2 className="size-4 animate-spin" />}
                  저장
                </button>
                <div className="ml-auto flex items-center gap-2">
                  <input
                    type="date"
                    value={paidAt}
                    onChange={(e) => setPaidAt(e.target.value)}
                    className="border-rule-faint focus:border-accent-blue h-10 rounded-md border bg-white px-2 text-sm outline-none"
                  />
                  <button
                    type="button"
                    onClick={doPaid}
                    disabled={pending}
                    className="inline-flex h-10 items-center gap-1.5 rounded-md bg-[#1E7E34] px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    지급 완료
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setCancelOpen(true)}
                  disabled={pending}
                  className="border-rule text-muted-fg hover:text-brand inline-flex h-10 items-center rounded-md border px-3 text-xs font-medium transition-colors disabled:opacity-60"
                >
                  확정 취소
                </button>
              </>
            )}
            {paid && (
              <button
                type="button"
                onClick={doReopen}
                disabled={pending}
                className="border-rule text-muted-fg hover:text-ink inline-flex h-10 items-center gap-1.5 rounded-md border px-4 text-sm font-medium transition-colors disabled:opacity-60"
              >
                {pending && <Loader2 className="size-4 animate-spin" />}
                지급완료 되돌리기
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 확정 확인 */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="z-[130]">
          <AlertDialogHeader>
            <AlertDialogTitle>{monthLabel} 정산을 확정할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              실지급액 <span className="text-ink font-bold">{formatPrice(effectiveTotal, "KRW")}</span>로 확정됩니다. 확정 시 금액이 현재 시점 기준으로
              스냅샷되어 잠깁니다(이후 수업·단가·환율 변경 영향 없음).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                doConfirm();
              }}
              className="bg-cta hover:bg-cta/90 border-transparent text-white"
            >
              확정
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 확정 취소 확인 */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent className="z-[130]">
          <AlertDialogHeader>
            <AlertDialogTitle>확정을 취소할까요?</AlertDialogTitle>
            <AlertDialogDescription>이 달 정산 확정 내역(조정·실지급액 포함)이 삭제되고 미확정 상태로 돌아갑니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>닫기</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setCancelOpen(false);
                doCancel();
              }}
              variant="brand"
            >
              확정 취소
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
