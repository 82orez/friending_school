"use client";

import { useEffect, useRef } from "react";
import { Users, X } from "lucide-react";

// 방 소개 전문(읽기 전용). HostProfileModal의 패널 스켈레톤을 이식했다.
// ⚠️ 표시용 문자열만 받는다 — 날짜/시간 조립 헬퍼(fmtMonthDay·fmtEnd)가 FriendingRooms의 로컬 함수라
//    여기서 import 하면 값 단위 순환 의존이 생긴다(HostProfile은 `import type`이라 무해).
export type RoomInfo = {
  title: string;
  hostName: string;
  levelLabel: string;
  when: string; // "8월 21일 · 08:00~08:40"
  participants: number;
  capacity: number;
  description: string;
};

export default function RoomInfoModal({ info, onClose }: { info: RoomInfo | null; onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // 열림 시: Esc 닫기 + body scroll lock + 닫기 버튼 포커스.
  useEffect(() => {
    if (!info) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // 참여 취소 AlertDialog가 열려 있으면 그쪽만 닫히도록 양보한다.
      if (e.key === "Escape" && !document.querySelector('[role="alertdialog"]')) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [info, onClose]);

  if (!info) return null;

  return (
    <>
      {/* 오버레이 */}
      <div aria-hidden="true" onClick={onClose} className="fixed inset-0 z-[110] bg-black/40" />

      {/* 패널 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="방 소개"
        className="fixed top-1/2 left-1/2 z-[120] flex max-h-[90vh] w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="border-rule flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-ink truncate text-lg font-bold">방 소개</h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-muted-fg-faint hover:text-ink focus-visible:ring-accent-blue/50 ml-3 shrink-0 rounded transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
            <X className="size-5" />
          </button>
        </div>

        <div className="overflow-auto px-6 py-5">
          <p className="text-ink text-base font-bold break-words">{info.title}</p>
          <p className="text-muted-fg mt-1 text-sm">
            {info.hostName}님 · {info.levelLabel}
          </p>
          <p className="text-muted-fg mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
            <span>{info.when}</span>
            <span className="inline-flex items-center gap-1">
              <Users aria-hidden className="size-3" />
              {info.participants}/{info.capacity}명
            </span>
          </p>

          <hr className="border-rule my-4" />

          <p className="text-ink text-sm leading-relaxed break-words whitespace-pre-wrap">{info.description}</p>
        </div>

        <div className="border-rule flex justify-end border-t px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="border-rule text-muted-fg hover:bg-surface rounded-md border px-4 py-2 text-sm font-bold transition-colors">
            닫기
          </button>
        </div>
      </div>
    </>
  );
}
