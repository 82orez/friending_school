"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateTeacherAvailability, type AvailabilitySlot } from "@/app/teacher/actions";
import type { BookedSlot } from "@/lib/availability";
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
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const slotKey = (day: number, min: number) => `${day}-${min}`;
const fmtTime = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

type Slot = { day: number; min: number };

// 예약 슬롯 타입은 공유 모델(`@/lib/availability`)에 — 기존 import 경로 호환 위해 재export.
export type { BookedSlot } from "@/lib/availability";

export default function AvailabilityGrid({
  initialSlots,
  bookedSlots,
  readOnly = false,
  onDirtyChange,
}: {
  initialSlots: Slot[];
  bookedSlots?: BookedSlot[];
  readOnly?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  // 예약 슬롯 맵(키→tier)·키 집합. 예약 셀은 색 표시 + 편집 잠금 + 가용에서 못 빼게 유지.
  const bookedTier = useMemo(() => {
    const m = new Map<string, BookedSlot["tier"]>();
    for (const b of bookedSlots ?? []) {
      const k = slotKey(b.day, b.min);
      if (m.get(k) === "confirmed") continue; // confirmed 우선
      m.set(k, b.tier);
    }
    return m;
  }, [bookedSlots]);
  const bookedLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of bookedSlots ?? []) if (b.label && !m.has(slotKey(b.day, b.min))) m.set(slotKey(b.day, b.min), b.label);
    return m;
  }, [bookedSlots]);
  const bookedKeys = useMemo(() => new Set(bookedTier.keys()), [bookedTier]);

  // 예약 슬롯은 항상 가용에 포함(저장 시 누락 방지 — 가용 밖 예약은 self-heal).
  const initialKeys = () => new Set<string>([...initialSlots.map((s) => slotKey(s.day, s.min)), ...Array.from(bookedKeys)]);
  const [selected, setSelected] = useState<Set<string>>(initialKeys);
  const [saved, setSaved] = useState<Set<string>>(initialKeys); // 마지막 저장 스냅샷(dirty 판정용)
  const [isPending, startTransition] = useTransition();
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [confirmRevert, setConfirmRevert] = useState(false);

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
    if (bookedKeys.has(key)) return; // 예약 셀은 잠금(토글 불가)
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
    if (readOnly || bookedKeys.has(slotKey(day, min))) return; // 예약 셀은 잠금
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

  // 미저장 변경 여부를 부모(모달 래퍼)에 통지 — 닫기 가드에 사용.
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

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
      <div className="max-h-[65vh] overflow-auto">
        <div className="min-w-[520px] select-none" onPointerMove={onGridMove}>
          {/* 요일 헤더 (스크롤 시 상단 고정) */}
          <div className="border-rule sticky top-0 z-20 flex border-b bg-white">
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
                  const key = slotKey(day, min);
                  const on = selected.has(key);
                  const tier = bookedTier.get(key);
                  const title = tier ? `${bookedLabel.get(key) ?? "Booked"} · ${tier === "confirmed" ? "Booked" : "Awaiting payment"}` : undefined;
                  return (
                    <div
                      key={day}
                      data-day={day}
                      data-min={min}
                      onPointerDown={() => onCellDown(day, min)}
                      title={title}
                      className={cn(
                        "border-rule-faint h-7 flex-1 border-l first:border-l-0",
                        !readOnly && !tier && "touch-none",
                        tier === "confirmed"
                          ? "cursor-not-allowed bg-[#1E7E34]"
                          : tier === "pending"
                            ? "cursor-not-allowed bg-[#6B4AD4]/55"
                            : on
                              ? readOnly
                                ? "bg-accent-blue/40"
                                : "bg-progress"
                              : !readOnly && "bg-white hover:bg-progress/10",
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
          <Button type="button" variant="brand" disabled={isPending || !dirty} onClick={() => setConfirmSave(true)}>
            {isPending ? (
              <>
                <Loader2 className="animate-spin" />
                Saving
              </>
            ) : (
              "Save"
            )}
          </Button>
          <Button type="button" variant="outline" disabled={isPending || !dirty} onClick={() => setConfirmRevert(true)}>
            Revert
          </Button>
          <Button type="button" variant="outline" disabled={isPending || selected.size === 0} onClick={() => setConfirmClear(true)}>
            Clear all
          </Button>
          <p className="text-muted-fg-faint text-xs">Click or drag cells to mark your available 30-minute slots.</p>
        </div>
      )}

      {bookedKeys.size > 0 && (
        <div className="text-muted-fg mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span className={cn("inline-block size-3 rounded-sm", readOnly ? "bg-accent-blue/40" : "bg-progress")} /> Available
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-sm bg-[#1E7E34]" /> Booked{!readOnly && " (locked)"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-sm bg-[#6B4AD4]/55" /> Awaiting payment
          </span>
        </div>
      )}

      {!readOnly && (
        <AlertDialog open={confirmSave} onOpenChange={setConfirmSave}>
          <AlertDialogContent className="z-[130]">
            <AlertDialogHeader>
              <AlertDialogTitle>Save your availability?</AlertDialogTitle>
              <AlertDialogDescription>Your schedule will be updated with the time slots you've selected.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setConfirmSave(false);
                  handleSave();
                }}>
                Save
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {!readOnly && (
        <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
          <AlertDialogContent className="z-[130]">
            <AlertDialogHeader>
              <AlertDialogTitle>Clear the entire schedule?</AlertDialogTitle>
              <AlertDialogDescription>All selected time slots will be cleared. You must click Save to apply the change.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setSelected(new Set(bookedKeys)); // 예약 슬롯은 남기고 나머지만 비움
                  setConfirmClear(false);
                }}>
                Clear all
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {!readOnly && (
        <AlertDialog open={confirmRevert} onOpenChange={setConfirmRevert}>
          <AlertDialogContent className="z-[130]">
            <AlertDialogHeader>
              <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
              <AlertDialogDescription>Your edits will be reverted to the last saved state.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setSelected(new Set(saved));
                  setConfirmRevert(false);
                }}>
                Revert
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
