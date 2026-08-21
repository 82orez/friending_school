"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fmtTime, formatDateKo } from "@/lib/availability";
import { canEnterClass, kstDateMinToMs } from "@/lib/classtime";
import { fmtRoomEnd, isNoShow } from "@/lib/room-time";
import { roomLevelLabelKo } from "@/data/room-levels";
import { leaveRoom } from "@/app/friending/actions";
import EnterRoomButton from "@/components/friending/EnterRoomButton";
import HostProfileModal from "@/components/friending/HostProfileModal";
import RoomInfoModal from "@/components/friending/RoomInfoModal";
import RoomReviewModal, { type ReviewTarget } from "@/components/mypage/RoomReviewModal";
import StarRating from "@/components/StarRating";
import type { HostProfile } from "@/components/friending/FriendingRooms";
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

// 내가 예약한 프렌더 연습방. 방 관리(/friender/rooms)의 목록 구조를 따르되
// 개설자 정보가 붙고 액션이 입장/예약 취소 둘뿐이다.
export type ReservedRoom = {
  id: string;
  frienderId: string;
  fallbackName: string; // hosts 조회 실패 시 쓰는 방 행의 이름 스냅샷
  title: string;
  description: string | null;
  level: string;
  capacity: number;
  sessionDate: string; // KST YYYY-MM-DD
  startMin: number;
  durationMin: number;
  participants: number;
  enteredAt: string | null; // 내 입장 시각(RLS select_own) — 노쇼 안내·후기 자격 판정용
  review: { rating: number; comment: string } | null; // 내가 남긴 후기
};

export default function MyRoomReservations({ rooms, hosts }: { rooms: ReservedRoom[]; hosts: Record<string, HostProfile> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cancelTarget, setCancelTarget] = useState<ReservedRoom | null>(null);
  const [hostTarget, setHostTarget] = useState<HostProfile | null>(null);
  const [infoTarget, setInfoTarget] = useState<string | null>(null);
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null);

  // 1분 틱 — 입장 시간창 진입, 예정/지난 전환을 실시간으로 반영(RoomsManager와 동일).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const { upcoming, past } = useMemo(() => {
    const up: ReservedRoom[] = [];
    const pa: ReservedRoom[] = [];
    for (const r of rooms) {
      (kstDateMinToMs(r.sessionDate, r.startMin + r.durationMin) > now ? up : pa).push(r);
    }
    // 예정은 가까운 순(서버 정렬 유지), 지난 예약은 최근 순.
    return { upcoming: up, past: pa.reverse() };
  }, [rooms, now]);

  const confirmCancel = () => {
    const target = cancelTarget;
    setCancelTarget(null); // base-nova는 AlertDialogAction이 자동으로 닫지 않는다.
    if (!target) return;
    startTransition(async () => {
      const res = await leaveRoom(target.id);
      if (res.ok) {
        router.refresh();
        toast.success("예약을 취소했습니다.");
      } else {
        toast.error(res.error ?? "오류가 발생했습니다.");
      }
    });
  };

  const hostOf = (r: ReservedRoom): HostProfile =>
    hosts[r.frienderId] ?? { name: r.fallbackName, avatarUrl: null, nationality: null, gender: null, bio: null };

  if (rooms.length === 0) {
    return (
      <div className="border-rule rounded-xl border bg-white px-6 py-16 text-center">
        <p className="text-ink text-sm font-bold">예약한 방이 없습니다.</p>
        <p className="text-muted-fg mt-1 text-sm">「프렌딩」에서 열려 있는 방을 둘러보세요.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-ink text-lg font-extrabold">프렌딩 예약</h2>
      <p className="text-muted-fg mt-1 text-sm">예약한 연습방을 확인하고 입장하거나 취소할 수 있습니다.</p>

      <Section title={`예정된 예약 (${upcoming.length})`} empty="예정된 예약이 없습니다." className="mt-4">
        {upcoming.map((r) => (
          <Row
            key={r.id}
            room={r}
            host={hostOf(r)}
            enterable={canEnterClass(now, kstDateMinToMs(r.sessionDate, r.startMin), kstDateMinToMs(r.sessionDate, r.startMin + r.durationMin))}
            noShow={isNoShow(r.enteredAt, kstDateMinToMs(r.sessionDate, r.startMin), now)}
            pending={pending}
            onOpenHost={setHostTarget}
            onOpenInfo={setInfoTarget}
            onCancel={() => setCancelTarget(r)}
          />
        ))}
      </Section>

      {past.length > 0 && (
        <Section title={`지난 예약 (${past.length})`} className="mt-8">
          {past.map((r) => (
            <Row
              key={r.id}
              room={r}
              host={hostOf(r)}
              isPast
              pending={pending}
              onOpenHost={setHostTarget}
              onOpenInfo={setInfoTarget}
              onOpenReview={() =>
                setReviewTarget({
                  roomId: r.id,
                  roomTitle: r.title,
                  hostName: hostOf(r).name,
                  when: `${formatDateKo(r.sessionDate)} · ${fmtTime(r.startMin)}~${fmtRoomEnd(r.startMin + r.durationMin)}`,
                  rating: r.review?.rating ?? null,
                  comment: r.review?.comment ?? "",
                })
              }
            />
          ))}
        </Section>
      )}

      <HostProfileModal host={hostTarget} onClose={() => setHostTarget(null)} />
      <RoomInfoModal description={infoTarget} onClose={() => setInfoTarget(null)} />
      <RoomReviewModal target={reviewTarget} onClose={() => setReviewTarget(null)} />

      {/* 예약 취소 확인 — /friending 카드의 다이얼로그와 같은 문구를 쓴다. */}
      <AlertDialog open={cancelTarget !== null} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>예약을 취소하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget && (
                <>
                  <span className="text-ink font-semibold">{cancelTarget.title}</span> 방의 예약이 취소됩니다. 자리가 남아 있으면 다시 예약할 수
                  있어요.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>닫기</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancel} variant="brand">
              예약 취소
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Section({ title, empty, className, children }: { title: string; empty?: string; className?: string; children: React.ReactNode }) {
  const isEmpty = Array.isArray(children) && children.length === 0;
  return (
    <section className={className}>
      <h3 className="text-ink text-sm font-extrabold">{title}</h3>
      <div className="border-rule mt-2 overflow-hidden rounded-xl border bg-white">
        {isEmpty && empty ? <p className="text-muted-fg px-6 py-10 text-center text-sm">{empty}</p> : <ul className="list-none">{children}</ul>}
      </div>
    </section>
  );
}

function Row({
  room,
  host,
  enterable,
  noShow,
  isPast,
  onOpenReview,
  pending,
  onOpenHost,
  onOpenInfo,
  onCancel,
}: {
  room: ReservedRoom;
  host: HostProfile;
  enterable?: boolean;
  noShow?: boolean;
  isPast?: boolean;
  onOpenReview?: () => void;
  pending: boolean;
  onOpenHost: (host: HostProfile) => void;
  onOpenInfo: (description: string) => void;
  onCancel?: () => void;
}) {
  const description = room.description?.trim() ?? "";

  return (
    <li className={cn("border-rule flex flex-wrap items-center gap-3 border-b px-4 py-3.5 last:border-b-0 md:px-6", isPast && "opacity-60")}>
      <div className="min-w-0 flex-1">
        <p className="text-ink truncate text-sm font-bold">{room.title}</p>
        <p className="text-muted-fg mt-0.5 text-xs">
          {formatDateKo(room.sessionDate)} · {fmtTime(room.startMin)}~{fmtRoomEnd(room.startMin + room.durationMin)}
        </p>
        <p className="text-muted-fg-faint mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          <button
            type="button"
            onClick={() => onOpenHost(host)}
            aria-haspopup="dialog"
            className="focus-visible:ring-accent-blue/50 hover:text-accent-blue-ink text-muted-fg max-w-[12rem] truncate rounded font-bold transition-colors hover:underline focus-visible:ring-2 focus-visible:outline-none">
            {host.name}님
          </button>
          <span className="bg-accent-blue-soft text-accent-blue-ink rounded-full px-2 py-0.5 font-bold">{roomLevelLabelKo(room.level)}</span>
          <span className="inline-flex items-center gap-1">
            <Users aria-hidden className="size-3" />
            {room.participants}/{room.capacity}명
          </span>
        </p>
        {/* 소개는 모달로 — 행마다 문단을 펼치면 목록이 들쭉날쭉해진다(프렌딩 카드와 같은 규칙). */}
        <button
          type="button"
          disabled={!description}
          aria-haspopup="dialog"
          title={description ? undefined : "등록된 소개가 없어요"}
          onClick={() => onOpenInfo(description)}
          className={cn(
            "focus-visible:ring-accent-blue/50 mt-1 inline-flex items-center gap-0.5 rounded text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:outline-none",
            description ? "text-accent-blue-ink hover:underline" : "text-muted-fg-faint/60 cursor-default",
          )}>
          <ChevronRight aria-hidden className="size-3" />방 소개글 보기
        </button>

        {/* 유예(시작 후 10분)까지 미입장이면 자리가 반환된다. 늦은 입장은 계속 허용하므로 입장 버튼은 그대로 둔다. */}
        {noShow && (
          <p className="text-muted-fg bg-surface border-rule mt-1.5 rounded-md border px-2 py-1 text-xs font-semibold">
            미입장 · 자리가 반환되었습니다. 아직 진행 중이면 입장할 수 있어요.
          </p>
        )}
      </div>

      {/* 입장 = 시간창(시작 15분 전~종료) 안일 때만. 그 밖일 때만 예약 취소를 노출한다
          — /friending 카드의 CTA 상태 머신과 같은 규칙이라 두 화면이 어긋나지 않는다. */}
      <div className="flex shrink-0 items-center gap-1.5">
        {enterable && (
          <EnterRoomButton
            roomId={room.id}
            label="입장"
            withGuide
            disabled={pending}
            className="bg-cta shrink-0 rounded-md px-3 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          />
        )}
        {/* 후기 — 지난 대화 중 '실제로 입장한' 건에만(서버 saveRoomReview도 같은 자격을 검증). */}
        {isPast && onOpenReview && room.enteredAt && (
          <button
            type="button"
            onClick={onOpenReview}
            disabled={pending}
            className="border-rule text-muted-fg hover:bg-surface inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-60">
            {room.review ? (
              <>
                <StarRating value={room.review.rating} size="sm" />
                후기 수정
              </>
            ) : (
              "후기 쓰기"
            )}
          </button>
        )}
        {!isPast && !enterable && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="border-rule text-muted-fg hover:bg-surface shrink-0 rounded-md border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-60">
            예약 취소
          </button>
        )}
      </div>
    </li>
  );
}
