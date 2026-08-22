"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import PrepCourseForm, { type PrepCourse, type PrepFormValues } from "@/components/friender/PrepCourseForm";
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

// 확인 모달(AlertDialog)이 열려 있는지 — Esc·오버레이 클릭이 이중으로 걸리지 않게(AvailabilityModal과 같은 가드).
const isConfirmOpen = () => typeof document !== "undefined" && !!document.querySelector('[role="alertdialog"]');

/**
 * 프렙 강좌 수정 모달. 개설 폼(`PrepCourseForm`)을 그대로 싣는다 —
 * 20개 주제 + 캘린더를 목록 안이나 페이지 상단에서 다시 그리면 스크롤이 길어져 어디를 고치는지 놓치기 쉽다.
 * `course`가 null이면 닫힘(RoomInfoModal과 같은 마운트 방식).
 */
export default function PrepEditModal({
  course,
  scheduleLocked,
  hasZoomUrl,
  pending,
  onClose,
  onSubmit,
}: {
  course: PrepCourse | null;
  scheduleLocked: boolean;
  hasZoomUrl: boolean;
  pending: boolean;
  onClose: () => void;
  onSubmit: (values: PrepFormValues) => void;
}) {
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const open = course !== null;

  // ⚠️ 최신 dirty/pending을 ref로 읽는다 — 아래 effect의 deps에 넣으면 첫 타이핑(dirty 전환)마다
  //    effect가 다시 돌면서 닫기 버튼으로 포커스를 뺏는다(입력 중 커서가 튐).
  const stateRef = useRef({ dirty, pending, onClose });
  stateRef.current = { dirty, pending, onClose };

  // 저장 중이거나 고친 내용이 있으면 바로 닫지 않는다(20칸을 다시 채우는 사고 방지).
  const requestClose = () => {
    const s = stateRef.current;
    if (s.pending) return;
    if (s.dirty) setConfirmClose(true);
    else s.onClose();
  };

  // 열림 시: Esc 닫기 + body scroll lock + 닫기 버튼 포커스.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isConfirmOpen()) requestClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!course) return null;

  return (
    <>
      {/* 오버레이 */}
      <div
        aria-hidden="true"
        onClick={() => {
          if (!isConfirmOpen()) requestClose();
        }}
        className="fixed inset-0 z-[110] bg-black/40"
      />

      {/* 패널 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="강좌 수정"
        className="fixed top-1/2 left-1/2 z-[120] flex max-h-[90vh] w-[min(94vw,720px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="border-rule flex items-center justify-between border-b px-5 py-4 md:px-6">
          <h2 className="text-ink truncate text-lg font-bold">강좌 수정: {course.title}</h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={requestClose}
            aria-label="닫기"
            className="text-muted-fg-faint hover:text-ink focus-visible:ring-accent-blue/50 ml-3 shrink-0 rounded transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
            <X className="size-5" />
          </button>
        </div>

        <div className="overflow-auto px-5 py-5 md:px-6">
          <PrepCourseForm
            mode="edit"
            initial={course}
            scheduleLocked={scheduleLocked}
            hasZoomUrl={hasZoomUrl}
            pending={pending}
            onSubmit={onSubmit}
            onCancel={requestClose}
            onDirtyChange={setDirty}
            confirmClassName="z-[130]"
          />
        </div>
      </div>

      {/* 닫기 가드 */}
      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent className="z-[130]">
          <AlertDialogHeader>
            <AlertDialogTitle>수정을 취소할까요?</AlertDialogTitle>
            <AlertDialogDescription>저장하지 않은 변경 내용이 사라집니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>계속 수정</AlertDialogCancel>
            <AlertDialogAction
              variant="brand"
              onClick={() => {
                setConfirmClose(false); // base-nova는 AlertDialogAction이 자동으로 닫지 않는다.
                onClose();
              }}>
              닫기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
