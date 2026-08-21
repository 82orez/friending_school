"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { deleteRoomReview, saveRoomReview } from "@/app/friending/actions";
import StarRating from "@/components/StarRating";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// 지난 대화 후기 작성·수정. HostProfileModal의 패널 스켈레톤을 이식했다.
export type ReviewTarget = {
  roomId: string;
  roomTitle: string;
  hostName: string;
  when: string; // "2026-08-21 (금) · 10:50~11:10"
  rating: number | null; // 기존 후기(없으면 null)
  comment: string;
};

const MAX_COMMENT = 1000;

export default function RoomReviewModal({ target, onClose }: { target: ReviewTarget | null; onClose: () => void }) {
  const router = useRouter();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [pending, startTransition] = useTransition();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  // 열릴 때마다 대상의 기존 값으로 초기화(다른 방을 연속으로 열어도 값이 새지 않게).
  useEffect(() => {
    if (!target) return;
    setRating(target.rating ?? 0);
    setComment(target.comment);
  }, [target]);

  // 열림 시: Esc 닫기 + body scroll lock + 닫기 버튼 포커스.
  useEffect(() => {
    if (!target) return;
    const onKeyDown = (e: KeyboardEvent) => {
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
  }, [target, onClose]);

  if (!target) return null;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        onClose();
        router.refresh();
        toast.success(success);
      } else {
        toast.error(res.error ?? "오류가 발생했습니다.");
      }
    });
  };

  const save = () => {
    if (rating < 1) {
      toast.error("별점을 선택해 주세요.");
      return;
    }
    run(() => saveRoomReview(target.roomId, rating, comment), target.rating ? "후기를 수정했습니다." : "후기를 남겼습니다.");
  };

  return (
    <>
      {/* 오버레이 */}
      <div aria-hidden="true" onClick={onClose} className="fixed inset-0 z-[110] bg-black/40" />

      {/* 패널 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="대화 후기"
        className="fixed top-1/2 left-1/2 z-[120] flex max-h-[90vh] w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="border-rule flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-ink truncate text-lg font-bold">대화 후기</h2>
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
          <p className="text-ink text-base font-bold break-words">{target.roomTitle}</p>
          <p className="text-muted-fg mt-1 text-sm">
            {target.hostName}님 · {target.when}
          </p>

          <div className="border-rule mt-4 border-t pt-4">
            <p className="text-ink text-sm font-bold">
              대화는 어떠셨나요? <span className="text-brand">*</span>
            </p>
            <StarRating value={rating} onChange={setRating} size="lg" className="mt-2" />

            <label className="mt-5 flex flex-col gap-1">
              <span className="text-muted-fg-faint text-xs font-semibold">후기 (선택)</span>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                disabled={pending}
                rows={4}
                maxLength={MAX_COMMENT}
                placeholder="어떤 점이 좋았는지 남겨 주세요. 프렌더에게 전달됩니다."
              />
            </label>
            <p className="text-muted-fg-faint mt-1 text-xs">작성한 후기는 해당 프렌더와 관리자만 볼 수 있습니다.</p>
          </div>
        </div>

        <div className="border-rule flex items-center justify-between gap-2 border-t px-6 py-4">
          {target.rating ? (
            <button
              type="button"
              onClick={() => run(() => deleteRoomReview(target.roomId), "후기를 삭제했습니다.")}
              disabled={pending}
              className="text-muted-fg hover:text-brand rounded text-sm font-bold transition-colors disabled:opacity-60">
              삭제
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              닫기
            </Button>
            <Button type="button" variant="brand" onClick={save} disabled={pending}>
              {target.rating ? "수정" : "등록"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
