"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarClock, X } from "lucide-react";
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
import AvailabilityGrid, { type BookedSlot } from "@/components/teacher/AvailabilityGrid";

type Slot = { day: number; min: number };

// 확인 모달(AlertDialog)이 열려 있는지 — Esc/오버레이 클릭 이중 트리거 방지용.
const isConfirmOpen = () => typeof document !== "undefined" && !!document.querySelector('[data-slot="alert-dialog-content"]');

export default function AvailabilityModal({ initialSlots, bookedSlots }: { initialSlots: Slot[]; bookedSlots?: BookedSlot[] }) {
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const prevOpen = useRef(false);

  const requestClose = () => {
    if (dirty) setConfirmClose(true);
    else setOpen(false);
  };

  // Esc 닫기 + body scroll lock (확인 모달이 열려 있으면 Esc 무시).
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isConfirmOpen()) requestClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dirty]);

  // 열림 시 닫기 버튼 포커스 · 닫힘 시 트리거 포커스 복귀 + dirty 리셋.
  useEffect(() => {
    if (open && !prevOpen.current) {
      closeButtonRef.current?.focus();
    } else if (!open && prevOpen.current) {
      triggerRef.current?.focus();
      setDirty(false);
    }
    prevOpen.current = open;
  }, [open]);

  return (
    <>
      {/* 요약 카드 (아코디언 대체) */}
      <div className="border-rule mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-white px-6 py-5">
        <div className="min-w-0">
          <h2 className="text-ink text-lg font-bold">Weekly Availability</h2>
          <p className="text-muted-fg mt-1 text-sm">
            {initialSlots.length > 0
              ? `${initialSlots.length} time slot${initialSlots.length === 1 ? "" : "s"} marked.`
              : "No availability set yet. Add the times you can teach."}
            {!!bookedSlots?.length && <span className="font-medium text-[#1E7E34]"> · {bookedSlots.length} booked</span>}
          </p>
        </div>
        <Button ref={triggerRef} type="button" variant="brand" onClick={() => setOpen(true)}>
          <CalendarClock />
          Edit availability
        </Button>
      </div>

      {/* 오버레이 */}
      <div
        aria-hidden="true"
        onClick={() => {
          if (!isConfirmOpen()) requestClose();
        }}
        className={`fixed inset-0 z-[110] bg-black/40 transition-opacity duration-200 ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* 패널 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Weekly Availability"
        aria-hidden={!open}
        inert={!open}
        className={`fixed top-1/2 left-1/2 z-[120] flex max-h-[90vh] w-[min(92vw,640px)] -translate-x-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-xl transition-[opacity,transform] duration-200 ${
          open ? "-translate-y-1/2 opacity-100" : "pointer-events-none -translate-y-[46%] opacity-0"
        }`}>
        <div className="border-rule flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-ink text-lg font-bold">Weekly Availability</h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className="text-muted-fg-faint hover:text-ink focus-visible:ring-accent-blue/50 rounded transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-auto px-6 py-5">
          <p className="text-muted-fg text-sm">Mark the 30-minute time slots when you&apos;re available to teach.</p>
          <p className="text-muted-fg-faint mt-1 text-xs">⏰ All times are shown in Korea Standard Time (KST · GMT+9).</p>
          <div className="mt-4">{open && <AvailabilityGrid initialSlots={initialSlots} bookedSlots={bookedSlots} onDirtyChange={setDirty} />}</div>
        </div>
      </div>

      {/* 닫기 가드 모달 */}
      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent className="z-[130]">
          <AlertDialogHeader>
            <AlertDialogTitle>Close without saving?</AlertDialogTitle>
            <AlertDialogDescription>You have unsaved changes. Closing will discard them.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmClose(false);
                setOpen(false);
              }}>
              Discard and close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
