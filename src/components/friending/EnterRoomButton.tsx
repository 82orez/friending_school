"use client";

import { enterRoom } from "@/app/friending/actions";
import EnterZoomButton from "@/components/EnterZoomButton";

// 연습방 입장 — 프렌딩 카드(참가자·호스트)와 방 관리 목록(호스트)이 공용한다.
// 팝업 차단 회피·안내 다이얼로그는 EnterZoomButton이 소유하고, 여기서는 방 액션만 묶는다
// (프렙 회차 입장이 같은 트릭을 복제하지 않도록 분리했다).
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
  return <EnterZoomButton enter={() => enterRoom(roomId)} withGuide={withGuide} label={label} className={className} disabled={disabled} />;
}
