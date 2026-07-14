"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { addExchangeRateSchedule, updateExchangeRateSchedule, deleteExchangeRateSchedule } from "@/app/admin/actions";
import { todayKstStr } from "@/lib/rates";
import type { FxRow } from "@/lib/fx";
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

// 통화별 환율 적용일 이력 편집기(RateHistoryEditor의 환율 버전 — scope/통화 select/센터복귀 없음).
// rows = 이 통화의 스케줄(page가 통화별로 필터해 전달). 각 금액은 정산·매출에서 날짜별 환율로 환산됨.
export default function ExchangeRateHistoryEditor({
  currency,
  symbol,
  rateLabel,
  rows,
}: {
  currency: string;
  symbol: string;
  rateLabel: string;
  rows: FxRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState(todayKstStr());
  const [rate, setRate] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const today = todayKstStr();
  const sorted = [...rows].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1)); // 적용 시점 내림차순
  // 오늘 기준 현재 유효 행(effective_from ≤ today 중 최신).
  const current = sorted.find((r) => r.effectiveFrom <= today) ?? null;
  const rateText = (r: number): string => `1${symbol} = ₩${r.toLocaleString()}`;

  const resetForm = () => {
    setEditingId(null);
    setDate(todayKstStr());
    setRate("");
  };

  const startEdit = (r: FxRow) => {
    setEditingId(r.id);
    setDate(r.effectiveFrom);
    setRate(String(r.rate));
  };

  const submit = () => {
    if (!date) {
      toast.error("적용 시점을 선택하세요.");
      return;
    }
    if (!(rate.trim() !== "" && Number(rate) > 0)) {
      toast.error("환율을 입력하세요.");
      return;
    }
    start(async () => {
      const res = editingId ? await updateExchangeRateSchedule(editingId, rate, date) : await addExchangeRateSchedule(currency, rate, date);
      if (res.ok) {
        resetForm();
        router.refresh();
        toast.success(editingId ? "환율을 수정했습니다." : "환율을 추가했습니다.");
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
      const res = await deleteExchangeRateSchedule(id);
      if (res.ok) {
        if (editingId === id) resetForm();
        router.refresh();
        toast.success("환율 이력을 삭제했습니다.");
      } else {
        toast.error(res.error ?? "오류가 발생했습니다.");
      }
    });
  };

  return (
    <div className="border-rule flex flex-col gap-3 rounded-xl border bg-white p-4">
      <p className="text-ink text-sm font-bold">
        {rateLabel}({symbol}) 환율
      </p>

      {/* 현재 적용 환율 요약 */}
      <div className="border-rule bg-surface flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
        <span className="text-muted-fg-faint text-xs font-semibold">현재 적용</span>
        <span className="text-ink font-semibold">{current ? rateText(current.rate) : "미설정"}</span>
      </div>

      {/* 이력 목록 */}
      {sorted.length > 0 && (
        <ul className="border-rule divide-rule divide-y overflow-hidden rounded-md border">
          {sorted.map((r) => {
            const active = current?.id === r.id;
            return (
              <li key={r.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="text-muted-fg w-24 shrink-0 tabular-nums">{r.effectiveFrom}</span>
                <span className="text-ink min-w-0 flex-1 break-words">
                  {rateText(r.rate)}
                  {active && (
                    <span className="bg-accent-blue-soft text-accent-blue-ink ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold">현재</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => startEdit(r)}
                  disabled={pending}
                  aria-label="수정"
                  className="text-muted-fg-faint hover:text-ink shrink-0 rounded p-1 transition-colors disabled:opacity-50"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteId(r.id)}
                  disabled={pending}
                  aria-label="삭제"
                  className="text-muted-fg-faint hover:text-brand shrink-0 rounded p-1 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* 추가/수정 폼 */}
      <div className="border-rule flex flex-col gap-2 rounded-md border p-3">
        <p className="text-muted-fg-faint text-xs font-semibold">{editingId ? "환율 수정" : "환율 변경"}</p>
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
          <div className="min-w-[8rem] flex-1">
            <label className="text-muted-fg-faint mb-1 block text-[11px] font-semibold">
              1{symbol} 당 원(₩)
            </label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              disabled={pending}
              placeholder="예: 2100"
              className="border-rule-faint focus:border-accent-blue h-9 w-full rounded-md border bg-white px-2 text-sm outline-none disabled:opacity-50"
            />
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="bg-cta inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : editingId ? null : <Plus className="size-4" />}
            {editingId ? "저장" : "추가"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              disabled={pending}
              className="border-rule text-muted-fg hover:text-ink inline-flex h-9 shrink-0 items-center gap-1 rounded-md border px-3 text-sm font-medium transition-colors disabled:opacity-60"
            >
              <X className="size-4" />
              취소
            </button>
          )}
        </div>
      </div>

      {/* 삭제 확인 */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>환율 이력을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>해당 시점의 환율이 삭제되며, 그 이후 정산·매출 환산은 이전 이력으로 재계산됩니다.</AlertDialogDescription>
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
