"use client";

import { type ReactNode, useState, useTransition } from "react";
import { Loader2, Video } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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

export type EnterZoomResult = { url?: string; error?: string };

// Zoom 입장 버튼 — **팝업 차단 회피 로직의 유일한 소유자**.
// 연습방(EnterRoomButton 래퍼)·프렙 회차가 공용한다. 강의실의 EnterClassButton은
// 자체 구현이 먼저 있었고 컴팩트/전체폭 변형이 붙어 있어 아직 합치지 않았다.
//
// enter: 서버 액션 호출을 감싼 함수(호출부가 id·종류를 캡처한다).
// withGuide: 안내 다이얼로그를 거칠지 — 참가자/수강생=true(에티켓 문구가 그들 대상),
//            호스트=false(자기 수업이라 바로 입장).
export default function EnterZoomButton({
  enter,
  withGuide = false,
  label = "입장하기",
  guideTitle = "입장 전 확인해 주세요",
  guideBody,
  className,
  disabled,
}: {
  enter: () => Promise<EnterZoomResult>;
  withGuide?: boolean;
  label?: string;
  guideTitle?: string;
  guideBody?: ReactNode;
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
      const res = await enter();
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
              <AlertDialogTitle>{guideTitle}</AlertDialogTitle>
              <AlertDialogDescription>
                {guideBody ?? (
                  <>
                    Zoom으로 연결되며 얼굴을 보이고 참여하는 것을 원칙으로 해요. 프렌더는 강사가 아니라 함께 연습하는 회원이에요. 서로 예의를 지켜
                    주세요.
                  </>
                )}
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
