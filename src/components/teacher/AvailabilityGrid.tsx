"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateTeacherAvailability, type AvailabilitySlot } from "@/app/teacher/actions";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

// 그리드 표시 범위(06:00~24:00, 30분)는 여기에만 — DB는 범위 비종속이라 변경 시 이 상수만 수정.
const START_HOUR = 6;
const END_HOUR = 24;
const SLOT_MIN = 30;
const ROW_MINS: number[] = []; // 360(06:00) ~ 1410(23:30), 36개
for (let m = START_HOUR * 60; m < END_HOUR * 60; m += SLOT_MIN) ROW_MINS.push(m);

// 표시 순서 월~일 → 저장 day(0=일) 매핑.
const DISPLAY_DAYS = [1, 2, 3, 4, 5, 6, 0];
const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

const slotKey = (day: number, min: number) => `${day}-${min}`;
const fmtTime = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

type Slot = { day: number; min: number };

export default function AvailabilityGrid({ initialSlots, readOnly = false }: { initialSlots: Slot[]; readOnly?: boolean }) {
  const initialKeys = () => new Set(initialSlots.map((s) => slotKey(s.day, s.min)));
  const [selected, setSelected] = useState<Set<string>>(initialKeys);
  const [saved, setSaved] = useState<Set<string>>(initialKeys); // 마지막 저장 스냅샷(dirty 판정용)
  const [isPending, startTransition] = useTransition();
  const [confirmClear, setConfirmClear] = useState(false);

  const draggingRef = useRef(false);
  const dragModeRef = useRef<"add" | "remove">("add");

  // 드래그 종료(그리드 밖에서 떼도).
  useEffect(() => {
    if (readOnly) return;
    const stop = () => {
      draggingRef.current = false;
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [readOnly]);

  const applyCell = (day: number, min: number) => {
    const key = slotKey(day, min);
    setSelected((prev) => {
      const has = prev.has(key);
      if (dragModeRef.current === "add" ? has : !has) return prev; // 변화 없음 → 동일 참조 유지
      const next = new Set(prev);
      if (dragModeRef.current === "add") next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const onCellDown = (day: number, min: number) => {
    if (readOnly) return;
    dragModeRef.current = selected.has(slotKey(day, min)) ? "remove" : "add";
    draggingRef.current = true;
    applyCell(day, min);
  };

  // 마우스/터치 통합 — 드래그 중 손가락/커서 아래 셀을 elementFromPoint로 찾아 적용.
  const onGridMove = (e: React.PointerEvent) => {
    if (readOnly || !draggingRef.current) return;
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const cell = el?.closest<HTMLElement>("[data-day]");
    if (!cell) return;
    const day = Number(cell.dataset.day);
    const min = Number(cell.dataset.min);
    if (Number.isInteger(day) && Number.isInteger(min)) applyCell(day, min);
  };

  const dirty = !readOnly && (selected.size !== saved.size || Array.from(selected).some((k) => !saved.has(k)));

  const handleSave = () => {
    const snapshot = new Set(selected);
    const slots: AvailabilitySlot[] = Array.from(selected).map((k) => {
      const [d, m] = k.split("-");
      return { day: Number(d), min: Number(m) };
    });
    startTransition(async () => {
      const res = await updateTeacherAvailability(slots);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setSaved(snapshot);
      toast.success("Availability saved.");
    });
  };

  return (
    <div>
      <div className="overflow-x-auto">
        <div className="min-w-[520px] select-none" onPointerMove={onGridMove}>
          {/* 요일 헤더 */}
          <div className="border-rule flex border-b">
            <div className="sticky left-0 z-10 w-14 shrink-0 bg-white" />
            {DISPLAY_DAYS.map((day, i) => (
              <div key={day} className="text-muted-fg flex-1 py-1.5 text-center text-xs font-bold">
                {DAY_LABELS[i]}
              </div>
            ))}
          </div>
          {/* 시간 행 */}
          {ROW_MINS.map((min) => {
            const onHour = min % 60 === 0;
            return (
              <div key={min} className={cn("flex border-t", onHour ? "border-muted-fg-faint border-t-2 border-solid" : "border-rule-faint border-dotted")}>
                <div
                  className={cn(
                    "sticky left-0 z-10 w-14 shrink-0 bg-white pr-1.5 text-right text-[10px] leading-7",
                    onHour ? "text-muted-fg font-semibold" : "text-muted-fg-faint",
                  )}>
                  {fmtTime(min)}
                </div>
                {DISPLAY_DAYS.map((day) => {
                  const on = selected.has(slotKey(day, min));
                  return (
                    <div
                      key={day}
                      data-day={day}
                      data-min={min}
                      onPointerDown={() => onCellDown(day, min)}
                      className={cn(
                        "border-rule-faint h-7 flex-1 border-l first:border-l-0",
                        !readOnly && "touch-none",
                        on ? (readOnly ? "bg-accent-blue-soft" : "bg-progress") : !readOnly && "bg-white hover:bg-progress/10",
                      )}
                    />
                  );
                })}
              </div>
            );
          })}
          {/* 24:00 마감선 */}
          <div className="border-muted-fg-faint flex border-t-2 border-solid">
            <div className="text-muted-fg sticky left-0 z-10 w-14 shrink-0 bg-white pr-1.5 text-right text-[10px] leading-4 font-semibold">24:00</div>
          </div>
        </div>
      </div>

      {!readOnly && (
        <div className="mt-4 flex items-center gap-3">
          <Button type="button" variant="brand" disabled={isPending || !dirty} onClick={handleSave}>
            {isPending ? (
              <>
                <Loader2 className="animate-spin" />
                Saving
              </>
            ) : (
              "Save"
            )}
          </Button>
          <Button type="button" variant="outline" disabled={isPending || selected.size === 0} onClick={() => setConfirmClear(true)}>
            Clear all
          </Button>
          <p className="text-muted-fg-faint text-xs">Click or drag cells to mark your available 30-minute slots.</p>
        </div>
      )}

      {!readOnly && (
        <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>전체 시간표를 초기화할까요?</AlertDialogTitle>
              <AlertDialogDescription>선택한 가능 시간이 모두 해제됩니다. 저장(Save)을 눌러야 실제로 반영됩니다.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setSelected(new Set());
                  setConfirmClear(false);
                }}>
                초기화
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
