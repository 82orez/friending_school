"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { addPgFeeSchedule, updatePgFeeSchedule, deletePgFeeSchedule } from "@/app/admin/actions";
import { todayKstStr } from "@/lib/rates";
import type { PgFeeRow } from "@/lib/pgfee";
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

// PG(결제대행) 수수료율 적용일 이력 편집기(ExchangeRateHistoryEditor의 단일 값 버전 — 통화 select 없음).
// 각 결제는 결제일 기준 유효 율로 수수료가 계산되므로 율 변경이 과거 집계에 소급되지 않음.
export default function PgFeeHistoryEditor({ rows }: { rows: PgFeeRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState(todayKstStr());
  const [rate, setRate] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const today = todayKstStr();
  const sorted = [...rows].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1)); // 적용 시점 내림차순
  const current = sorted.find((r) => r.effectiveFrom <= today) ?? null;
  const rateText = (r: number): string => `${r}%`;

  const resetForm = () => {
    setEditingId(null);
    setDate(todayKstStr());
    setRate("");
  };

  const startEdit = (r: PgFeeRow) => {
    setEditingId(r.id);
    setDate(r.effectiveFrom);
    setRate(String(r.ratePercent));
  };

  const submit = () => {
    if (!date) {
      toast.error("적용 시점을 선택하세요.");
      return;
    }
    if (!(rate.trim() !== "" && Number(rate) >= 0 && Number(rate) < 100)) {
      toast.error("수수료율(0 이상 100 미만)을 입력하세요.");
      return;
    }
    start(async () => {
      const res = editingId ? await updatePgFeeSchedule(editingId, rate, date) : await addPgFeeSchedule(rate, date);
      if (res.ok) {
        resetForm();
        router.refresh();
        toast.success(editingId ? "수수료율을 수정했습니다." : "수수료율을 추가했습니다.");
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
      const res = await deletePgFeeSchedule(id);
      if (res.ok) {
        if (editingId === id) resetForm();
        router.refresh();
        toast.success("수수료율 이력을 삭제했습니다.");
      } else {
        toast.error(res.error ?? "오류가 발생했습니다.");
      }
    });
  };

  return (
    <div className="border-rule flex flex-col gap-3 rounded-xl border bg-white p-4">
      <p className="text-ink text-sm font-bold">PG 결제 수수료율</p>
      <p className="text-muted-fg-faint text-xs">
        카드 등 PG 경유 결제에 적용되는 부가세 포함 총 청구율입니다(예: 3.3%). 무통장 입금은 수수료가 적용되지 않으며, 각 결제는 결제일 기준 율로
        계산됩니다.
      </p>

      {/* 현재 적용 요약 */}
      <div className="border-rule bg-surface flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
        <span className="text-muted-fg-faint text-xs font-semibold">현재 적용</span>
        <span className="text-ink font-semibold">{current ? rateText(current.ratePercent) : "미설정(수수료 0)"}</span>
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
                  {rateText(r.ratePercent)}
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
        <p className="text-muted-fg-faint text-xs font-semibold">{editingId ? "수수료율 수정" : "수수료율 변경"}</p>
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
            <label className="text-muted-fg-faint mb-1 block text-[11px] font-semibold">수수료율 (%)</label>
            <input
              type="number"
              min={0}
              max={99.999}
              step={0.01}
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              disabled={pending}
              placeholder="예: 3.3"
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
      </div>

      {/* 삭제 확인 */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>수수료율 이력을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              해당 시점의 수수료율이 삭제되며, 그 이후 매출·매출이익의 수수료는 이전 이력으로 재계산됩니다.
            </AlertDialogDescription>
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
