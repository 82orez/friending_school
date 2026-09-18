"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChevronRight, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fmtTime } from "@/lib/availability";
import { canEnterClass, kstDateMinToMs } from "@/lib/classtime";
import { fmtRoomEnd } from "@/lib/room-time";
import { fmtDateKo, fmtDateShort } from "@/lib/date-kst";
import { weekdaysLabelOf } from "@/lib/room-series";
import { roomLevelLabelKo } from "@/data/room-levels";
import { joinRoom, leaveRoom } from "@/app/friending/actions";
import HostProfileModal from "@/components/friending/HostProfileModal";
import RoomSeriesDetailModal from "@/components/friending/RoomSeriesDetailModal";
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
  /** 표시명 — 닉네임 우선(연습방 카드 규칙). */
  name: string;
  /** 본명(성+이름). 샤우팅 강좌 카드가 「이름(닉네임)」으로 쓴다. 없으면 null. */
  realName: string | null;
  avatarUrl: string | null;
  nationality: string | null;
  gender: string | null;
  bio: string | null;
};

// 회차 = 예전의 방 한 개. 예약·입장·노쇼가 전부 여기 붙는다(테이블도 그대로 friender_rooms 행).
export type PublicRoomSession = {
  id: string;
  sessionDate: string; // KST YYYY-MM-DD
  startMin: number;
  durationMin: number;
  topic: string | null;
  participants: number;
  joined: boolean;
  enteredAt: string | null; // 내 입장 시각(RLS select_own) — 노쇼 판정용. 미예약이면 null
};

// 시리즈 = 같은 series_id로 한 번에 개설된 회차 묶음(전환 이전 단발 방은 1회차 시리즈).
export type PublicRoomSeries = {
  key: string;
  frienderId: string;
  fallbackName: string; // hosts 조회 실패 시 쓰는 방 행의 이름 스냅샷
  isMine: boolean;
  title: string;
  description: string | null;
  level: string;
  capacity: number;
  sessions: PublicRoomSession[]; // 날짜 오름차순. **지난 회차도 포함**(커리큘럼을 보여준다)
};

const PAGE_STEP = 12;

// 아바타 그라디언트 — v9 목업 프리셋. 시리즈 키 해시로 고정 배정(리렌더에도 안 바뀜).
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

const EMPTY_HOST: HostProfile = { name: "", realName: null, avatarUrl: null, nationality: null, gender: null, bio: null };

type Group = { key: string; label: string; items: PublicRoomSeries[] };

export default function FriendingRooms({
  series,
  hosts,
  isLoggedIn,
}: {
  series: PublicRoomSeries[];
  hosts: Record<string, HostProfile>;
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const [visible, setVisible] = useState(PAGE_STEP);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [joinTarget, setJoinTarget] = useState<PublicRoomSession | null>(null);
  const [leaveTarget, setLeaveTarget] = useState<PublicRoomSession | null>(null);
  const [hostTarget, setHostTarget] = useState<HostProfile | null>(null);
  const [detailKey, setDetailKey] = useState<string | null>(null);

  // 1분 틱 — 진행 중/입장창 상태를 시간에 따라 갱신.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // 입장 시간창(시작 15분 전~종료) — 섹션 분류와 입장 버튼 노출이 같은 기준이라 서로 어긋나지 않는다.
  const canEnterSession = (s: PublicRoomSession) =>
    canEnterClass(now, kstDateMinToMs(s.sessionDate, s.startMin), kstDateMinToMs(s.sessionDate, s.startMin + s.durationMin));
  const isLive = (x: PublicRoomSeries) => x.sessions.some(canEnterSession);

  const liveCount = useMemo(() => series.filter(isLive).length, [series, now]);

  // 상태로 그룹 — 지금 들어갈 수 있는 회차가 있는지가 이 화면의 첫 질문이다.
  const groups = useMemo<Group[]>(() => {
    const live: PublicRoomSeries[] = [];
    const waiting: PublicRoomSeries[] = [];
    for (const x of series.slice(0, visible)) (isLive(x) ? live : waiting).push(x);

    const out: Group[] = [];
    if (live.length) out.push({ key: "live", label: "진행 중", items: live });
    if (waiting.length) out.push({ key: "waiting", label: "예정", items: waiting });
    return out;
  }, [series, visible, now]);

  // 상세 모달은 최신 데이터를 보도록 key로만 들고 있는다(router.refresh() 후 새 prop이 반영된다).
  const detail = useMemo(() => series.find((x) => x.key === detailKey) ?? null, [series, detailKey]);

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

  if (series.length === 0) {
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
          무료 연습방
          <span className="rounded-full bg-[#eafff1] px-2 py-0.5 text-[11px] font-extrabold text-[#22c55e]">FREE</span>
        </h2>
        <p className="text-muted-fg flex items-center gap-1.5 text-[13px] font-bold">
          <LiveDot active={liveCount > 0} />
          열린 방 {series.length}개
        </p>
      </div>

      {groups.map((g, i) => {
        const isLiveSection = g.key === "live";
        return (
          <section
            key={g.key}
            className={cn(
              "mt-8",
              // 첫 섹션 위에는 선을 긋지 않는다(상단 헤더와 붙어 이중선처럼 보임).
              i > 0 && "border-rule border-t pt-8",
              // 진행 중 섹션만 배경 박스로 감싼다 — 제목만으로는 두 영역이 잘 갈리지 않았다.
              // 초록 hex는 LiveDot·FREE 배지에서 이미 쓰는 값(대응 토큰 없는 예외)을 그대로 재사용.
              isLiveSection && "rounded-2xl border border-[#22c55e]/25 bg-[#eafff1]/60 p-3 md:p-4",
            )}>
            <h3 className={cn("flex items-center gap-1.5 text-sm font-extrabold", isLiveSection ? "text-[#22c55e]" : "text-ink")}>
              {isLiveSection && <LiveDot active />}
              {g.label}
              <span className="text-muted-fg font-bold">{g.items.length}</span>
            </h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map((x) => (
                <SeriesCard
                  key={x.key}
                  series={x}
                  host={hosts[x.frienderId] ?? { ...EMPTY_HOST, name: x.fallbackName }}
                  now={now}
                  onOpenHost={setHostTarget}
                  onOpenDetail={() => setDetailKey(x.key)}
                />
              ))}
            </div>
          </section>
        );
      })}

      {visible < series.length && (
        <button
          type="button"
          onClick={() => setVisible((v) => v + PAGE_STEP)}
          className="bg-surface text-muted-fg hover:bg-rule/60 mt-6 w-full rounded-xl py-3 text-sm font-bold transition-colors">
          더보기
        </button>
      )}

      {/* 개설자 공개 프로필 */}
      <HostProfileModal host={hostTarget} onClose={() => setHostTarget(null)} />

      {/* 시리즈 상세 — 회차 목록과 회차별 예약을 맡는다(액션은 여기서 콜백으로 받아 실행). */}
      <RoomSeriesDetailModal
        series={detail}
        host={detail ? (hosts[detail.frienderId] ?? { ...EMPTY_HOST, name: detail.fallbackName }) : EMPTY_HOST}
        isLoggedIn={isLoggedIn}
        now={now}
        pendingId={pendingId}
        disabled={pending}
        onJoin={setJoinTarget}
        onLeave={setLeaveTarget}
        onClose={() => setDetailKey(null)}
      />

      {/* 예약 확인 — 회차에서 바로 실행되던 것을 한 단계 거치게 한다. */}
      <AlertDialog open={joinTarget !== null} onOpenChange={(open) => !open && setJoinTarget(null)}>
        <AlertDialogContent className="z-[130]">
          <AlertDialogHeader>
            <AlertDialogTitle>이 회차를 예약할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {joinTarget && (
                <>
                  <span className="text-ink font-semibold">{fmtDateKo(joinTarget.sessionDate)}</span> {fmtTime(joinTarget.startMin)}~
                  {fmtRoomEnd(joinTarget.startMin + joinTarget.durationMin)}
                  <br />
                  {canEnterSession(joinTarget)
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
        <AlertDialogContent className="z-[130]">
          <AlertDialogHeader>
            <AlertDialogTitle>예약을 취소하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              {leaveTarget && <>{fmtDateShort(leaveTarget.sessionDate)} 회차의 예약이 취소됩니다. 자리가 남아 있으면 다시 예약할 수 있어요.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {/* 임박 경고 — ⚠️ AlertDialogDescription은 <p>라 그 바깥 형제로 둔다. */}
          {leaveTarget && canEnterSession(leaveTarget) && (
            <p className="border-brand/30 bg-brand/5 text-brand rounded-lg border px-3 py-2 text-sm font-semibold">
              곧 시작하는 방입니다. 개설자가 인원을 기다리고 있을 수 있어요.
            </p>
          )}
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

// 시리즈 카드 — 비교 항목이 카드마다 같은 자리에 오도록 dl로 적는다(샤우팅 강좌 카드와 같은 규칙).
// 예약·입장은 카드가 아니라 「세부정보 보기」 모달의 회차 행이 맡는다.
function SeriesCard({
  series,
  host,
  now,
  onOpenHost,
  onOpenDetail,
}: {
  series: PublicRoomSeries;
  host: HostProfile;
  now: number;
  onOpenHost: (host: HostProfile) => void;
  onOpenDetail: () => void;
}) {
  const sessions = series.sessions;
  const first = sessions[0];
  const last = sessions[sessions.length - 1];
  const remaining = sessions.filter((s) => kstDateMinToMs(s.sessionDate, s.startMin + s.durationMin) > now);
  const myCount = remaining.filter((s) => s.joined).length;
  const sameTime = sessions.every((s) => s.startMin === first.startMin && s.durationMin === first.durationMin);

  return (
    <div className="border-rule flex flex-col rounded-2xl border bg-white p-3.5">
      <div className="flex items-start gap-2.5">
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
            style={{ background: gradientOf(series.key) }}
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
          <p className="text-ink mt-1 line-clamp-2 text-sm font-semibold">{series.title}</p>
        </div>
      </div>

      <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
        <span className="bg-cta/10 text-cta rounded-full px-2 py-0.5">
          총 {sessions.length}회차 · {weekdaysLabelOf(sessions.map((s) => s.sessionDate))}
        </span>
        {/* 난이도 — 글자만 빨강(text-brand). 배경은 옆의 회차·요일 칩과 구분되도록 연파랑 그대로 둔다. */}
        <span className="bg-accent-blue-soft text-brand rounded-full px-2 py-0.5">{roomLevelLabelKo(series.level)}</span>
      </p>

      <dl className="text-muted-fg mt-2 grid grid-cols-[3.5rem_1fr] gap-x-2 gap-y-1 text-[13px]">
        <dt className="text-muted-fg-faint">기간</dt>
        <dd className="text-ink font-semibold">
          {fmtDateKo(first.sessionDate)} ~ {fmtDateKo(last.sessionDate)}
        </dd>
        <dt className="text-muted-fg-faint">시간</dt>
        <dd className="text-ink font-semibold">
          {sameTime ? `${fmtTime(first.startMin)}~${fmtRoomEnd(first.startMin + first.durationMin)}` : "회차별 상이"}
        </dd>
        <dt className="text-muted-fg-faint">남은 회차</dt>
        <dd className="text-ink font-semibold">{remaining.length}회차</dd>
        <dt className="text-muted-fg-faint">내 예약</dt>
        <dd className={cn("font-semibold", myCount > 0 ? "text-cta" : "text-ink")}>
          <span className="inline-flex items-center gap-1">
            <Users aria-hidden className="size-3" />
            {myCount > 0 ? `${myCount}개 회차` : "없음"}
          </span>
        </dd>
      </dl>

      {/* CTA는 카드마다 같은 높이에 오도록 mt-auto로 바닥에 붙인다. */}
      <button
        type="button"
        onClick={onOpenDetail}
        aria-haspopup="dialog"
        className="border-rule text-accent-blue-ink hover:bg-surface mt-3 inline-flex w-full items-center justify-center gap-0.5 rounded-full border py-2 text-sm font-bold transition-colors">
        세부정보 보기
        <ChevronRight aria-hidden className="size-3.5" />
      </button>
    </div>
  );
}
