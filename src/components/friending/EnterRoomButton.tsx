"use client";

import { useState, useTransition } from "react";
import { Loader2, Video } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { enterRoom } from "@/app/friending/actions";
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

// 방 입장 버튼 — 프렌딩 카드(참가자·호스트)와 방 관리 목록(호스트)이 공용한다.
// 강의실의 EnterClassButton과 같은 역할: 입장 로직이 화면마다 복제되지 않도록 한 곳에 둔다.
//
// withGuide: 안내 다이얼로그를 거칠지 여부.
//   참가자=true(에티켓 안내가 참가자 대상 문구라 필요) / 호스트=false(자기 방이라 바로 입장).
export default function EnterRoomButton({
  roomId,
  withGuide = false,
  label = "입장하기",
  className,
  disabled,
}: {
  roomId: string;
  withGuide?: boolean;
  label?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  // ⚠️ 팝업 차단 회피: 사용자 제스처 안에서 빈 탭을 먼저 열어두고,
  //    서버 응답이 오면 그 탭의 위치만 바꾼다(응답 후 open하면 차단된다).
  const go = () => {
    const w = window.open("", "_blank");
    startTransition(async () => {
      const res = await enterRoom(roomId);
      if (res.url) {
        if (w) w.location.href = res.url;
        else window.open(res.url, "_blank");
      } else {
        w?.close();
        toast.error(res.error ?? "입장할 수 없어요.");
      }
    });
  };

  const handleClick = () => {
    if (withGuide) setConfirmOpen(true);
    else go();
  };

  const confirm = () => {
    setConfirmOpen(false); // base-nova는 AlertDialogAction이 자동으로 닫지 않는다.
    go();
  };

  return (
    <>
      <button type="button" onClick={handleClick} disabled={disabled || pending} className={cn("inline-flex items-center gap-1.5", className)}>
        {pending ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <Video aria-hidden className="size-3.5" />}
        {label}
      </button>

      {withGuide && (
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>입장 전 확인해 주세요</AlertDialogTitle>
              <AlertDialogDescription>
                Zoom으로 연결되며 얼굴을 보이고 참여하는 것을 원칙으로 해요. 프렌더는 강사가 아니라 함께 연습하는 회원이에요. 서로 예의를 지켜 주세요.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction onClick={confirm} className="bg-cta hover:bg-cta/90 border-transparent text-white">
                입장할게요
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
