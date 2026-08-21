"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fmtTime } from "@/lib/availability";
import { canEnterClass, kstDateMinToMs } from "@/lib/classtime";
import { fmtRoomEnd } from "@/lib/room-time";
import { roomLevelLabelKo } from "@/data/room-levels";
import { joinRoom, leaveRoom } from "@/app/friending/actions";
import EnterRoomButton from "@/components/friending/EnterRoomButton";
import HostProfileModal from "@/components/friending/HostProfileModal";
import RoomInfoModal from "@/components/friending/RoomInfoModal";
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

// 개설자 공개 프로필 — 방마다 중복 직렬화하지 않도록 friender_id 기준 맵으로 받는다.
// ⚠️ 공개 페이지라 연락처(email·phone·zoom_url)는 서버 select 단계에서 제외된다.
export type HostProfile = {
  name: string;
  avatarUrl: string | null;
  nationality: string | null;
  gender: string | null;
  bio: string | null;
};

export type PublicRoom = {
  id: string;
  frienderId: string;
  fallbackName: string; // hosts 조회 실패 시 쓰는 방 행의 이름 스냅샷
  isMine: boolean;
  title: string;
  description: string | null;
  level: string;
  capacity: number;
  sessionDate: string; // KST YYYY-MM-DD
  startMin: number;
  durationMin: number;
  participants: number;
  joined: boolean;
};

const PAGE_STEP = 12;

// 아바타 그라디언트 — v9 목업 프리셋. 방 id 해시로 고정 배정(리렌더에도 안 바뀜).
const AVATAR_GRADIENTS = [
  "linear-gradient(135deg,#3ecfb2,#6366f1)",
  "linear-gradient(135deg,#6366f1,#a855f7)",
  "linear-gradient(135deg,#f43f8e,#f97316)",
  "linear-gradient(135deg,#22c55e,#3ecfb2)",
];
const gradientOf = (id: string): string => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
};

// "8월 21일" — 날짜 그룹 헤더/카드 표기용(로케일 함수 대신 직접 조립: 하이드레이션 안전).
const fmtMonthDay = (dateStr: string): string => {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${m}월 ${d}일`;
};

type Group = { key: string; label: string; rooms: PublicRoom[] };

export default function FriendingRooms({
  rooms,
  hosts,
  isLoggedIn,
}: {
  rooms: PublicRoom[];
  hosts: Record<string, HostProfile>;
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const [visible, setVisible] = useState(PAGE_STEP);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [joinTarget, setJoinTarget] = useState<PublicRoom | null>(null);
  const [leaveTarget, setLeaveTarget] = useState<PublicRoom | null>(null);
  const [hostTarget, setHostTarget] = useState<HostProfile | null>(null);
  const [infoTarget, setInfoTarget] = useState<string | null>(null);

  // 1분 틱 — 진행 중/입장창 상태를 시간에 따라 갱신.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // 입장 시간창(시작 15분 전~종료) — 섹션 분류와 입장 버튼 노출이 같은 기준이라 서로 어긋나지 않는다.
  const canEnter = (r: PublicRoom) =>
    canEnterClass(now, kstDateMinToMs(r.sessionDate, r.startMin), kstDateMinToMs(r.sessionDate, r.startMin + r.durationMin));

  const liveCount = useMemo(() => rooms.filter(canEnter).length, [rooms, now]);

  // 상태로 그룹 — 지금 들어갈 수 있는 방이 있는지가 이 화면의 첫 질문이다.
  // 날짜는 카드마다 "8월 22일 · 08:00~08:20"으로 적혀 있어 따로 묶지 않는다.
  // 섹션 내부 순서는 서버 정렬(session_date, start_min 오름차순)을 그대로 쓴다.
  const groups = useMemo<Group[]>(() => {
    const live: PublicRoom[] = [];
    const waiting: PublicRoom[] = [];
    for (const r of rooms.slice(0, visible)) (canEnter(r) ? live : waiting).push(r);

    const out: Group[] = [];
    if (live.length) out.push({ key: "live", label: "대화 중", rooms: live });
    if (waiting.length) out.push({ key: "waiting", label: "대기 중", rooms: waiting });
    return out;
  }, [rooms, visible, now]);

  const run = (roomId: string, fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    setPendingId(roomId);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        router.refresh();
        toast.success(success);
      } else {
        toast.error(res.error ?? "오류가 발생했습니다.");
      }
      setPendingId(null);
    });
  };

  const confirmJoin = () => {
    const target = joinTarget;
    setJoinTarget(null); // base-nova는 AlertDialogAction이 자동으로 닫지 않는다.
    if (!target) return;
    run(target.id, () => joinRoom(target.id), "예약했습니다.");
  };

  const confirmLeave = () => {
    const target = leaveTarget;
    setLeaveTarget(null); // base-nova는 AlertDialogAction이 자동으로 닫지 않는다.
    if (!target) return;
    run(target.id, () => leaveRoom(target.id), "예약을 취소했습니다.");
  };

  if (rooms.length === 0) {
    return (
      <div className="border-rule mt-8 rounded-xl border bg-white px-6 py-16 text-center">
        <p className="text-ink text-sm font-bold">지금 열려 있는 방이 없어요.</p>
        <p className="text-muted-fg mt-1 text-sm">곧 새로운 방이 열릴 거예요.</p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      {/* 섹션 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-ink flex items-center gap-2 text-base font-extrabold">
          오픈 대화
          <span className="rounded-full bg-[#eafff1] px-2 py-0.5 text-[11px] font-extrabold text-[#22c55e]">FREE</span>
        </h2>
        <p className="text-muted-fg flex items-center gap-1.5 text-[13px] font-bold">
          <LiveDot active={liveCount > 0} />
          {liveCount > 0 ? `지금 ${liveCount}개 대화 중` : `열린 방 ${rooms.length}개`}
        </p>
      </div>

      {groups.map((g) => (
        <section key={g.key} className="mt-5">
          <h3 className="text-muted-fg-faint flex items-center gap-1.5 text-xs font-extrabold">
            {g.key === "live" && <LiveDot active />}
            {g.label}
          </h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.rooms.map((r) => (
              <RoomCard
                key={r.id}
                room={r}
                host={hosts[r.frienderId] ?? { name: r.fallbackName, avatarUrl: null, nationality: null, gender: null, bio: null }}
                isLoggedIn={isLoggedIn}
                onOpenHost={setHostTarget}
                onOpenInfo={setInfoTarget}
                enterable={canEnter(r)}
                busy={pending && pendingId === r.id}
                disabled={pending}
                onJoin={() => setJoinTarget(r)}
                onLeave={() => setLeaveTarget(r)}
              />
            ))}
          </div>
        </section>
      ))}

      {visible < rooms.length && (
        <button
          type="button"
          onClick={() => setVisible((v) => v + PAGE_STEP)}
          className="bg-surface text-muted-fg hover:bg-rule/60 mt-6 w-full rounded-xl py-3 text-sm font-bold transition-colors">
          더보기
        </button>
      )}

      {/* 개설자 공개 프로필 */}
      <HostProfileModal host={hostTarget} onClose={() => setHostTarget(null)} />

      {/* 방 소개 전문 */}
      <RoomInfoModal description={infoTarget} onClose={() => setInfoTarget(null)} />

      {/* 예약 확인 — 카드에서 바로 실행되던 것을 한 단계 거치게 한다. */}
      <AlertDialog open={joinTarget !== null} onOpenChange={(open) => !open && setJoinTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>이 방을 예약할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {joinTarget && (
                <>
                  <span className="text-ink font-semibold">{joinTarget.title}</span> · {fmtMonthDay(joinTarget.sessionDate)}{" "}
                  {fmtTime(joinTarget.startMin)}~{fmtRoomEnd(joinTarget.startMin + joinTarget.durationMin)}
                  <br />
                  {canEnter(joinTarget)
                    ? "지금 진행 중인 방이라 바로 입장할 수 있어요."
                    : "시작 15분 전부터 입장할 수 있어요. 예약은 언제든 취소할 수 있습니다."}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>닫기</AlertDialogCancel>
            <AlertDialogAction onClick={confirmJoin} variant="brand">
              예약하기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 예약 취소 확인 */}
      <AlertDialog open={leaveTarget !== null} onOpenChange={(open) => !open && setLeaveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>예약을 취소하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              {leaveTarget && (
                <>
                  <span className="text-ink font-semibold">{leaveTarget.title}</span> 방의 예약이 취소됩니다. 자리가 남아 있으면 다시 예약할 수
                  있어요.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>닫기</AlertDialogCancel>
            <AlertDialogAction onClick={confirmLeave} variant="brand">
              예약 취소
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// 라이브 표시 점 — v9 목업의 .app-live-dot(초록 원 + 퍼지는 링) 재현.
function LiveDot({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 rounded-full", active ? "animate-pulse bg-[#4ade80] ring-3 ring-[#4ade80]/25" : "bg-rule-faint")}
    />
  );
}

function RoomCard({
  room,
  host,
  isLoggedIn,
  enterable,
  busy,
  disabled,
  onJoin,
  onLeave,
  onOpenHost,
  onOpenInfo,
}: {
  room: PublicRoom;
  host: HostProfile;
  isLoggedIn: boolean;
  enterable: boolean;
  busy: boolean;
  disabled: boolean;
  onJoin: () => void;
  onLeave: () => void;
  onOpenHost: (host: HostProfile) => void;
  onOpenInfo: (description: string) => void;
}) {
  const full = room.participants >= room.capacity;
  const pill = "shrink-0 rounded-full px-4 py-2 text-sm font-bold transition-colors disabled:opacity-60";
  const levelLabel = roomLevelLabelKo(room.level);
  const when = `${fmtMonthDay(room.sessionDate)} · ${fmtTime(room.startMin)}~${fmtRoomEnd(room.startMin + room.durationMin)}`;
  const description = room.description?.trim() ?? "";

  return (
    <div className="border-rule flex items-start gap-2.5 rounded-2xl border bg-white p-3.5">
      {/* 아바타 — 등록된 프로필 사진 우선, 없으면 이니셜+그라디언트 원으로 폴백 */}
      {host.avatarUrl ? (
        <Image
          src={host.avatarUrl}
          alt={`${host.name}님 프로필 사진`}
          width={36}
          height={36}
          className="border-rule size-9 shrink-0 rounded-full border object-cover"
        />
      ) : (
        <span
          aria-hidden
          style={{ background: gradientOf(room.id) }}
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-white">
          {host.name.slice(0, 1)}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="text-ink flex items-center gap-1.5 text-[15px] font-bold">
          <button
            type="button"
            onClick={() => onOpenHost(host)}
            aria-haspopup="dialog"
            className="focus-visible:ring-accent-blue/50 hover:text-accent-blue-ink min-w-0 truncate rounded font-bold transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
            {host.name}님
          </button>
          <span
            title="프렌더"
            aria-hidden
            className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-[50%_50%_50%_3px] bg-[#DC52B8] text-[8px] font-bold text-white">
            F
          </span>
        </p>

        <p className="text-ink mt-1 line-clamp-1 text-sm font-semibold">{room.title}</p>

        <p className="text-muted-fg mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
          <span className="inline-flex items-center gap-1">
            <Users aria-hidden className="size-3" />
            {room.participants}/{room.capacity}명
          </span>
          <span>{when}</span>
          <span className="bg-accent-blue-soft text-accent-blue-ink rounded-full px-2 py-0.5 text-[11px] font-bold">{levelLabel}</span>
        </p>

        {/* 소개는 모달로 — 문단을 조건부로 렌더하면 카드마다 CTA 높이가 달라진다(버튼은 항상 렌더, 소개 없으면 비활성). */}
        <div className="mt-1.5">
          <button
            type="button"
            disabled={!description}
            aria-haspopup="dialog"
            title={description ? undefined : "등록된 소개가 없어요"}
            onClick={() => onOpenInfo(description)}
            className={cn(
              "focus-visible:ring-accent-blue/50 inline-flex items-center gap-0.5 rounded text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
              description ? "text-accent-blue-ink hover:underline" : "text-muted-fg-faint/60 cursor-default",
            )}>
            <ChevronRight aria-hidden className="size-3" />방 소개글 보기
          </button>
        </div>

        <div className="mt-2.5">
          {!isLoggedIn ? (
            <Link href="/login?next=/friending" className={cn(pill, "bg-cta inline-block text-white hover:opacity-90")}>
              로그인하고 예약
            </Link>
          ) : room.isMine && enterable ? (
            // 개설자도 시간창 안에서는 입장 — 안내 다이얼로그는 참가자 대상 문구라 건너뛴다.
            <EnterRoomButton roomId={room.id} className={cn(pill, "bg-cta text-white")} />
          ) : room.isMine ? (
            <button type="button" disabled className={cn(pill, "bg-rule text-muted-fg cursor-default")}>
              내 방
            </button>
          ) : room.joined && enterable ? (
            <EnterRoomButton roomId={room.id} withGuide className={cn(pill, "bg-cta text-white")} disabled={disabled} />
          ) : room.joined ? (
            <button type="button" onClick={onLeave} disabled={disabled} className={cn(pill, "border-rule text-muted-fg hover:bg-surface border")}>
              예약 취소
            </button>
          ) : full ? (
            <button type="button" disabled className={cn(pill, "bg-rule text-muted-fg-faint cursor-default")}>
              마감
            </button>
          ) : (
            <button type="button" onClick={onJoin} disabled={disabled} className={cn(pill, "bg-cta inline-flex items-center gap-1.5 text-white")}>
              {busy && <Loader2 aria-hidden className="size-3.5 animate-spin" />}
              예약하기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
