"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { CURRENCIES, DEFAULT_CURRENCY, formatPrice, krwEquivalent, type Rates } from "@/data/currencies";
import { addRateSchedule, updateRateSchedule, deleteRateSchedule } from "@/app/admin/actions";
import { currentRate, todayKstStr, type RateRow, type RateScope } from "@/lib/rates";
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

// 금액+통화 → "₱85 ≈ ₩2,125" (외화 환율 있을 때만 ≈KRW 병기).
function priceLabel(price: number, currency: string | null, rates: Rates): string {
  const eq = krwEquivalent(price, currency, rates);
  return formatPrice(price, currency) + (eq != null ? ` ≈ ${formatPrice(eq, "KRW")}` : "");
}

// 단가 적용일 이력 편집기(센터·강사 개별 단가 공용). rows=이 scope_id의 스케줄(page가 필터해 전달).
// allowRevert=강사 개별 단가에서 "센터 단가 사용"(price=null) 허용. fallbackLabel=현재 센터 단가(강사 표시용).
export default function RateHistoryEditor({
  scope,
  scopeId,
  rows,
  rates,
  allowRevert,
  fallbackLabel,
}: {
  scope: RateScope;
  scopeId: string;
  rows: RateRow[];
  rates: Rates;
  allowRevert: boolean;
  fallbackLabel?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState(todayKstStr());
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [price, setPrice] = useState("");
  const [useCenter, setUseCenter] = useState(false); // 강사: "센터 단가 사용"(price=null)
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const sorted = [...rows].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1)); // 적용일 내림차순
  const cur = currentRate(rows, scope, scopeId);
  const currentLabel =
    cur && cur.price != null
      ? priceLabel(cur.price, cur.currency, rates)
      : scope === "teacher"
        ? `센터 단가${fallbackLabel ? ` · ${fallbackLabel}` : ""}`
        : "미설정";

  const resetForm = () => {
    setEditingId(null);
    setDate(todayKstStr());
    setCurrency(DEFAULT_CURRENCY);
    setPrice("");
    setUseCenter(false);
  };

  const startEdit = (r: RateRow) => {
    setEditingId(r.id);
    setDate(r.effectiveFrom);
    setCurrency(r.currency ?? DEFAULT_CURRENCY);
    setPrice(r.price == null ? "" : String(r.price));
    setUseCenter(r.price == null);
  };

  const submit = () => {
    const revert = allowRevert && useCenter;
    if (!date) {
      toast.error("적용 시작일을 선택하세요.");
      return;
    }
    if (!revert && !(price.trim() !== "" && Number(price) >= 0)) {
      toast.error("단가를 입력하세요.");
      return;
    }
    const priceArg = revert ? "" : price;
    start(async () => {
      const res = editingId
        ? await updateRateSchedule(editingId, priceArg, currency, date, "")
        : await addRateSchedule(scope, scopeId, priceArg, currency, date, "");
      if (res.ok) {
        resetForm();
        router.refresh();
        toast.success(editingId ? "단가를 수정했습니다." : "단가를 추가했습니다.");
      } else {
        toast.error(res.error ?? "오류가 발생했습니다.");
      }
    });
  };

  const confirmDelete = () => {
    const id = deleteId;
    setDeleteId(null);
    if (!id) return;
    start(async () => {
      const res = await deleteRateSchedule(id);
      if (res.ok) {
        if (editingId === id) resetForm();
        router.refresh();
        toast.success("단가 이력을 삭제했습니다.");
      } else {
        toast.error(res.error ?? "오류가 발생했습니다.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {/* 현재 적용 단가 요약 */}
      <div className="border-rule bg-surface flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
        <span className="text-muted-fg-faint text-xs font-semibold">현재 적용</span>
        <span className="text-ink font-semibold">{currentLabel}</span>
      </div>

      {/* 이력 목록 */}
      {sorted.length > 0 && (
        <ul className="border-rule divide-rule divide-y overflow-hidden rounded-md border">
          {sorted.map((r) => {
            const active = cur?.id === r.id;
            return (
              <li key={r.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="text-muted-fg w-24 shrink-0 tabular-nums">{r.effectiveFrom}</span>
                <span className="text-ink min-w-0 flex-1 break-words">
                  {r.price == null ? <span className="text-muted-fg-faint">센터 단가 사용</span> : priceLabel(r.price, r.currency, rates)}
                  {active && (
                    <span className="bg-accent-blue-soft text-accent-blue-ink ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold">현재</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => startEdit(r)}
                  disabled={pending}
                  aria-label="수정"
                  className="text-muted-fg-faint hover:text-ink shrink-0 rounded p-1 transition-colors disabled:opacity-50">
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteId(r.id)}
                  disabled={pending}
                  aria-label="삭제"
                  className="text-muted-fg-faint hover:text-brand shrink-0 rounded p-1 transition-colors disabled:opacity-50">
                  <Trash2 className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* 추가/수정 폼 */}
      <div className="border-rule flex flex-col gap-2 rounded-md border p-3">
        <p className="text-muted-fg-faint text-xs font-semibold">
          {scope === "teacher" ? (editingId ? "개별 단가 수정" : "개별 단가 설정") : editingId ? "적용 단가 수정" : "적용 단가 변경"}
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-muted-fg-faint mb-1 block text-[11px] font-semibold">적용 시점</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={pending}
              className="border-rule-faint focus:border-accent-blue h-9 rounded-md border bg-white px-2 text-sm outline-none disabled:opacity-50"
            />
          </div>
          <div>
            <label className="text-muted-fg-faint mb-1 block text-[11px] font-semibold">통화</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              disabled={pending || useCenter}
              className="border-rule-faint focus:border-accent-blue h-9 rounded-md border bg-white px-2 text-sm outline-none disabled:opacity-50">
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.symbol} {c.code}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[7rem] flex-1">
            <label className="text-muted-fg-faint mb-1 block text-[11px] font-semibold">회당 단가</label>
            <input
              type="number"
              min={0}
              step={currency === "USD" ? 0.1 : 1}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              disabled={pending || useCenter}
              placeholder={useCenter ? "센터 단가 사용" : "예: 90"}
              className="border-rule-faint focus:border-accent-blue h-9 w-full rounded-md border bg-white px-2 text-sm outline-none disabled:opacity-50"
            />
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="bg-cta inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60">
            {pending ? <Loader2 className="size-4 animate-spin" /> : editingId ? null : <Plus className="size-4" />}
            {editingId ? "저장" : "추가"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              disabled={pending}
              className="border-rule text-muted-fg hover:text-ink inline-flex h-9 shrink-0 items-center gap-1 rounded-md border px-3 text-sm font-medium transition-colors disabled:opacity-60">
              <X className="size-4" />
              취소
            </button>
          )}
        </div>
        {allowRevert && (
          <label className="text-muted-fg inline-flex w-fit cursor-pointer items-center gap-1.5 text-xs font-medium">
            <input
              type="checkbox"
              checked={useCenter}
              onChange={(e) => setUseCenter(e.target.checked)}
              disabled={pending}
              className="accent-accent-blue size-3.5"
            />
            이 날짜부터 센터 단가 사용(개별 단가 해제)
          </label>
        )}
      </div>

      {/* 삭제 확인 (모달 위에 표시되도록 z-[130]) */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent className="z-[130]">
          <AlertDialogHeader>
            <AlertDialogTitle>단가 이력을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>해당 적용일 단가가 삭제되며, 그 이후 정산은 이전 이력·센터 단가로 재계산됩니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} variant="brand">
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
