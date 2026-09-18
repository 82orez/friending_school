"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { ROOM_LEVELS } from "@/data/room-levels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

// 확인 모달(AlertDialog)이 열려 있는지 — Esc·오버레이 클릭이 이중으로 걸리지 않게(PrepEditModal과 같은 가드).
const isConfirmOpen = () => typeof document !== "undefined" && !!document.querySelector('[role="alertdialog"]');

export type RoomSeriesPatchValues = {
  title: string;
  description: string;
  level: string;
  capacity: number;
};

export type EditableSeries = {
  key: string;
  title: string;
  description: string | null;
  level: string;
  capacity: number;
  remaining: number; // 아직 시작하지 않은 회차 수(수정이 반영되는 범위)
  maxReserved: number; // 남은 회차 중 가장 많이 예약된 인원 = 정원 하한
};

/**
 * 연습방 시리즈 **공통값** 수정 모달 — 이름·소개·난이도·제한 인원.
 * 일정(날짜·시각·진행 시간)과 회차 주제는 목록의 회차 행에서 개별로 고친다(예약자 보호 규칙이 회차마다 다르다).
 * `series`가 null이면 닫힘(RoomInfoModal과 같은 마운트 방식).
 */
export default function RoomSeriesEditModal({
  series,
  pending,
  onClose,
  onSubmit,
}: {
  series: EditableSeries | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (values: RoomSeriesPatchValues) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [level, setLevel] = useState("");
  const [capacity, setCapacity] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const open = series !== null;
  const seriesKey = series?.key ?? null;

  // 대상이 바뀌면 입력을 그 시리즈 값으로 다시 채운다(목록에서 다른 카드를 열 수 있다).
  useEffect(() => {
    if (!series) return;
    setTitle(series.title);
    setDescription(series.description ?? "");
    setLevel(series.level);
    setCapacity(String(series.capacity));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesKey]);

  const dirty = useMemo(() => {
    if (!series) return false;
    return title !== series.title || description !== (series.description ?? "") || level !== series.level || capacity !== String(series.capacity);
  }, [series, title, description, level, capacity]);

  // ⚠️ 최신 dirty/pending을 ref로 읽는다 — effect deps에 넣으면 첫 타이핑마다 effect가 다시 돌면서
  //    닫기 버튼으로 포커스를 뺏는다(입력 중 커서가 튐).
  const stateRef = useRef({ dirty, pending, onClose });
  stateRef.current = { dirty, pending, onClose };

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

  if (!series) return null;

  const capacityNum = Number(capacity);
  const capacityValid = Number.isInteger(capacityNum) && capacityNum >= Math.max(1, series.maxReserved) && capacityNum <= 100;
  const canSave = !pending && !!title.trim() && capacityValid;
  const selectClass = "border-rule focus:border-accent-blue h-10 rounded-md border bg-white px-3 text-sm outline-none disabled:opacity-60";

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
        aria-label="연습방 정보 수정"
        className="fixed top-1/2 left-1/2 z-[120] flex max-h-[90vh] w-[min(94vw,560px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="border-rule flex items-center justify-between border-b px-5 py-4 md:px-6">
          <h2 className="text-ink truncate text-lg font-bold">연습방 정보 수정</h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={requestClose}
            aria-label="닫기"
            className="text-muted-fg-faint hover:text-ink focus-visible:ring-accent-blue/50 ml-3 shrink-0 rounded transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-3 overflow-auto px-5 py-5 md:px-6">
          <p className="text-muted-fg bg-surface border-rule rounded-lg border px-3 py-2 text-xs font-semibold">
            아직 시작하지 않은 {series.remaining}개 회차에 한꺼번에 반영됩니다. 지난 회차는 기록이라 그대로 남습니다. 일정과 회차 주제는 목록의 회차별
            「수정」에서 고칩니다.
          </p>

          <label className="flex flex-col gap-1">
            <span className="text-muted-fg-faint text-xs font-semibold">
              연습방 이름 <span className="text-brand">*</span>
            </span>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={pending} maxLength={100} className="h-10" />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-muted-fg-faint text-xs font-semibold">난이도</span>
              <select value={level} disabled={pending} onChange={(e) => setLevel(e.target.value)} className={selectClass}>
                {ROOM_LEVELS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.ko}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-muted-fg-faint text-xs font-semibold">제한 인원 (1~100명)</span>
              <Input
                type="number"
                min={Math.max(1, series.maxReserved)}
                max={100}
                value={capacity}
                disabled={pending}
                onChange={(e) => setCapacity(e.target.value)}
                className="h-10"
              />
              {series.maxReserved > 0 && (
                <span className="text-muted-fg-faint text-xs">이미 {series.maxReserved}명이 예약한 회차가 있어 그보다 줄일 수 없어요.</span>
              )}
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-muted-fg-faint text-xs font-semibold">방 소개 (선택)</span>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} disabled={pending} rows={4} maxLength={1000} />
          </label>
        </div>

        <div className="border-rule flex justify-end gap-2 border-t px-5 py-4 md:px-6">
          <Button type="button" variant="outline" disabled={pending} onClick={requestClose}>
            취소
          </Button>
          <Button type="button" variant="brand" disabled={!canSave} onClick={() => onSubmit({ title, description, level, capacity: capacityNum })}>
            {pending && <Loader2 className="animate-spin" />}
            저장
          </Button>
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
