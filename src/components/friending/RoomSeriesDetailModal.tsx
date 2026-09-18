"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Loader2, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtTime } from "@/lib/availability";
import { canEnterClass, kstDateMinToMs } from "@/lib/classtime";
import { fmtRoomEnd, isNoShow } from "@/lib/room-time";
import { fmtDateKo, fmtDateShort } from "@/lib/date-kst";
import { weekdaysLabelOf } from "@/lib/room-series";
import { roomLevelLabelKo } from "@/data/room-levels";
import EnterRoomButton from "@/components/friending/EnterRoomButton";
import RoomSeriesBoard from "@/components/friending/RoomSeriesBoard";
import type { HostProfile, PublicRoomSeries, PublicRoomSession } from "@/components/friending/FriendingRooms";

// 연습방 시리즈 상세 — 회차 목록과 회차별 예약을 모두 맡는다(샤우팅 PrepCourseDetailModal 이식).
// ⚠️ **모달은 서버 액션을 부르지 않는다** — 예약·취소 액션과 확인 AlertDialog·toast·router.refresh()는
//    FriendingRooms가 전담하고 여기서는 onJoin/onLeave 콜백만 올린다.
//    **예외는 게시판 탭**: 예약 pending·확인 다이얼로그와 겹치지 않는 자기 완결형 하위 트리라
//    RoomSeriesBoard가 자기 액션을 직접 부른다(샤우팅 PrepCourseBoard와 같은 판단).
// ⚠️ 패널 규약은 RoomInfoModal과 동일: 오버레이 z-[110]·패널 z-[120]·Esc는 [role="alertdialog"]에 양보.

const isAlertOpen = () => typeof document !== "undefined" && !!document.querySelector('[role="alertdialog"]');

// 탭 — 샤우팅 상세 모달과 같은 구성. '전체'는 필터 없음이고 나머지는 섹션의 cat과 매칭한다.
type Cat = "intro" | "sessions" | "board";
const TABS: { key: "all" | Cat; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "intro", label: "방 소개" },
  { key: "sessions", label: "회차별 예약" },
  { key: "board", label: "게시판" },
];

export default function RoomSeriesDetailModal({
  series,
  host,
  isLoggedIn,
  now,
  pendingId,
  disabled,
  onJoin,
  onLeave,
  onClose,
}: {
  series: PublicRoomSeries | null;
  host: HostProfile;
  isLoggedIn: boolean;
  now: number;
  pendingId: string | null;
  disabled: boolean;
  onJoin: (session: PublicRoomSession) => void;
  onLeave: (session: PublicRoomSession) => void;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [tab, setTab] = useState<"all" | Cat>("all");
  const open = series !== null;

  // 열림 시: 탭 초기화 + Esc 닫기 + body scroll lock + 닫기 버튼 포커스.
  // ⚠️ 탭을 되돌리는 건 이 컴포넌트가 `series=null`이어도 **언마운트되지 않아** state가 살아남기 때문이다
  //    (게시판 탭에서 닫고 다른 방을 열면 남의 게시판이 먼저 보인다).
  useEffect(() => {
    if (!open) return;
    setTab("all");
    const onKeyDown = (e: KeyboardEvent) => {
      // 예약/취소 확인 다이얼로그가 떠 있으면 그쪽이 Esc를 갖는다(이중 닫힘 방지).
      if (e.key === "Escape" && !isAlertOpen()) onClose();
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

  const show = (cat: Cat) => tab === "all" || tab === cat;

  const sessions = series.sessions;
  const dates = sessions.map((s) => s.sessionDate);
  const first = sessions[0];
  const last = sessions[sessions.length - 1];
  const startMsOf = (s: PublicRoomSession) => kstDateMinToMs(s.sessionDate, s.startMin);
  const endMsOf = (s: PublicRoomSession) => kstDateMinToMs(s.sessionDate, s.startMin + s.durationMin);
  const remaining = sessions.filter((s) => endMsOf(s) > now);
  const myCount = remaining.filter((s) => s.joined).length;
  const description = series.description?.trim() ?? "";
  const bio = host.bio?.trim() ?? "";

  // 시각이 회차마다 다를 수 있다(프렌더가 회차를 개별 조정) — 다르면 대표 시각 대신 안내 문구.
  const sameTime = sessions.every((s) => s.startMin === first.startMin && s.durationMin === first.durationMin);

  return (
    <>
      {/* 오버레이 */}
      <div
        aria-hidden="true"
        onClick={() => {
          if (!isAlertOpen()) onClose();
        }}
        className="fixed inset-0 z-[110] bg-black/40"
      />

      {/* 패널 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${series.title} 상세`}
        className="fixed top-1/2 left-1/2 z-[120] flex max-h-[90vh] w-[min(94vw,680px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        {/* 헤더 */}
        <div className="border-rule flex items-start justify-between gap-3 border-b px-5 py-4 md:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            {host.avatarUrl ? (
              <Image
                src={host.avatarUrl}
                alt={`${host.name}님 프로필 사진`}
                width={40}
                height={40}
                className="border-rule size-10 shrink-0 rounded-full border object-cover"
              />
            ) : (
              <span
                aria-hidden
                className="bg-cta/80 flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-white">
                {host.name.slice(0, 1)}
              </span>
            )}
            <div className="min-w-0">
              <p className="text-ink truncate text-base font-extrabold">{series.title}</p>
              <p className="text-muted-fg truncate text-xs font-bold">{host.name}님</p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-muted-fg-faint hover:text-ink focus-visible:ring-accent-blue/50 shrink-0 rounded transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
            <X className="size-5" />
          </button>
        </div>

        {/* 탭 — 헤더와 본문 사이의 **고정 행**이다(스크롤 영역 바깥).
            ⚠️ 스크롤 영역 안의 `sticky top-0`으로 두면 오버스크롤 중 카드가 탭 위아래로 비쳐 보인다
               (샤우팅 모달에서 겪은 것과 같은 함정). */}
        <div className="border-rule flex shrink-0 gap-1.5 border-b px-5 py-3 md:px-6">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "flex-1 rounded-full py-2 text-[13px] font-bold transition-colors",
                tab === t.key ? "bg-ink text-white" : "bg-surface text-muted-fg hover:text-ink",
              )}>
              {t.label}
            </button>
          ))}
        </div>

        {/* 본문 */}
        <div className="space-y-3 overflow-auto px-5 py-5 md:px-6">
          {/* 방 정보 — 회차가 여럿이라 비교 항목이 같은 자리에 와야 훑을 수 있다(dl). */}
          {show("intro") && (
            <section className="border-rule rounded-xl border p-3">
              <h3 className="text-ink text-sm font-bold">방 정보</h3>
              <dl className="mt-2 grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
                <dt className="text-muted-fg-faint">기간</dt>
                <dd className="text-ink font-semibold">
                  {fmtDateKo(first.sessionDate)} ~ {fmtDateKo(last.sessionDate)}
                </dd>
                <dt className="text-muted-fg-faint">수업 요일</dt>
                <dd className="text-ink font-semibold">
                  {weekdaysLabelOf(dates)} · 총 {sessions.length}회차
                </dd>
                <dt className="text-muted-fg-faint">시간</dt>
                <dd className="text-ink font-semibold">
                  {sameTime ? `${fmtTime(first.startMin)}~${fmtRoomEnd(first.startMin + first.durationMin)} (${first.durationMin}분)` : "회차별 상이"}
                </dd>
                <dt className="text-muted-fg-faint">난이도</dt>
                {/* 난이도만 빨강(text-brand) — 카드의 난이도 칩과 같은 색이라 모달에서도 눈이 같은 곳을 짚는다. */}
                <dd className="text-brand font-semibold">{roomLevelLabelKo(series.level)}</dd>
                <dt className="text-muted-fg-faint">정원</dt>
                <dd className="text-ink font-semibold">회차당 {series.capacity}명</dd>
                <dt className="text-muted-fg-faint">내 예약</dt>
                <dd className="text-ink font-semibold">{myCount > 0 ? `${myCount}개 회차` : "없음"}</dd>
              </dl>
            </section>
          )}

          {show("intro") && description && (
            <section className="border-rule rounded-xl border p-3">
              <h3 className="text-ink text-sm font-bold">방 소개</h3>
              <p className="text-muted-fg mt-1.5 text-sm whitespace-pre-wrap">{description}</p>
            </section>
          )}

          {show("intro") && bio && (
            <section className="border-rule rounded-xl border p-3">
              <h3 className="text-ink text-sm font-bold">프렌더 소개</h3>
              <p className="text-muted-fg mt-1.5 text-sm whitespace-pre-wrap">{bio}</p>
            </section>
          )}

          {/* 회차 목록 — 예약은 여기서 회차별로 한다. */}
          {show("sessions") && (
            <section className="border-rule rounded-xl border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-ink text-sm font-bold">회차별 예약</h3>
                <p className="text-muted-fg text-xs font-bold">남은 {remaining.length}회차</p>
              </div>
              <ul className="mt-2 list-none">
                {sessions.map((s, i) => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    index={i}
                    total={sessions.length}
                    capacity={series.capacity}
                    isMine={series.isMine}
                    isLoggedIn={isLoggedIn}
                    now={now}
                    busy={pendingId === s.id}
                    disabled={disabled}
                    onJoin={() => onJoin(s)}
                    onLeave={() => onLeave(s)}
                  />
                ))}
              </ul>
            </section>
          )}

          {/* 게시판 — ⚠️ 여기만 `show("board")`가 아니라 `tab === "board"`다(「전체」 탭에서 제외).
              마운트가 곧 로드라 탭을 눌러야 요청이 나가고, 길이를 예측할 수 없는 상호작용 영역이라
              훑어보기 흐름을 끊지 않는다(샤우팅과 같은 규칙). `key`로 방이 바뀌면 상태를 버린다. */}
          {tab === "board" && <RoomSeriesBoard key={series.key} seriesKey={series.key} isLoggedIn={isLoggedIn} />}
        </div>
      </div>
    </>
  );
}

/* ===== 회차 행 — CTA 상태 머신은 예전 연습방 카드의 것을 그대로 옮겼다 ===== */

function SessionRow({
  session,
  index,
  total,
  capacity,
  isMine,
  isLoggedIn,
  now,
  busy,
  disabled,
  onJoin,
  onLeave,
}: {
  session: PublicRoomSession;
  index: number;
  total: number;
  capacity: number;
  isMine: boolean;
  isLoggedIn: boolean;
  now: number;
  busy: boolean;
  disabled: boolean;
  onJoin: () => void;
  onLeave: () => void;
}) {
  const startMs = kstDateMinToMs(session.sessionDate, session.startMin);
  const endMs = kstDateMinToMs(session.sessionDate, session.startMin + session.durationMin);
  const past = endMs <= now;
  const enterable = canEnterClass(now, startMs, endMs);
  // 노쇼(시작 + 유예까지 미입장) — 자리가 이미 반환됐으므로 취소 버튼을 감춘다.
  const noShow = isNoShow(session.enteredAt, startMs, now);
  const full = session.participants >= capacity;

  const pill = "shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-60";

  return (
    <li className={cn("border-rule flex flex-wrap items-center gap-2 border-b py-2.5 last:border-b-0", past && "opacity-60")}>
      <div className="min-w-0 flex-1">
        <p className="text-ink text-sm font-bold">
          <span className="text-muted-fg-faint font-semibold">
            {index + 1}/{total}회차
          </span>{" "}
          · {fmtDateShort(session.sessionDate)} · {fmtTime(session.startMin)}~{fmtRoomEnd(session.startMin + session.durationMin)}
        </p>
        <p className="text-muted-fg mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
          <span className="inline-flex items-center gap-1">
            <Users aria-hidden className="size-3" />
            {session.participants}/{capacity}명
          </span>
          {/* 주제는 선택 입력이라 비어 있을 수 있다 — 자리를 비우지 않고 「주제 미정」으로 채운다
              (행마다 항목 수가 달라지면 목록을 훑기 어렵다. 프렌더 방 관리 행과 같은 문구). */}
          <span className={cn("truncate", !session.topic?.trim() && "text-muted-fg-faint")}>{session.topic?.trim() || "주제 미정"}</span>
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {past ? (
          <span className="text-muted-fg-faint text-xs font-bold">종료</span>
        ) : !isLoggedIn ? (
          <Link href="/login" className={cn(pill, "bg-cta inline-block text-white hover:opacity-90")}>
            로그인하고 예약
          </Link>
        ) : isMine && enterable ? (
          // 개설자도 시간창 안에서는 입장 — 안내 다이얼로그는 참가자 대상 문구라 건너뛴다.
          <EnterRoomButton roomId={session.id} label="입장하기" className={cn(pill, "bg-cta text-white")} />
        ) : isMine ? (
          <span className="text-muted-fg-faint text-xs font-bold">내 방</span>
        ) : session.joined && enterable ? (
          // ⚠️ 입장창 안이어도 취소를 막지 않는다 — 안 오면 어차피 노쇼로 자리가 반환된다.
          //    단 **노쇼 이후·입장 완료 뒤에는 감춘다**(자리는 이미 반환됐고, entered_at이 사라지면 후기 자격을 잃는다).
          //    /mypage/rooms 행과 한 쌍이라 함께 바꿀 것.
          <>
            <EnterRoomButton roomId={session.id} withGuide label="입장하기" className={cn(pill, "bg-cta text-white")} disabled={disabled} />
            {!session.enteredAt && !noShow && (
              <button
                type="button"
                onClick={onLeave}
                disabled={disabled}
                className="text-muted-fg hover:text-ink shrink-0 text-xs font-bold underline underline-offset-2 transition-colors disabled:opacity-60">
                예약 취소
              </button>
            )}
          </>
        ) : session.joined ? (
          <button type="button" onClick={onLeave} disabled={disabled} className={cn(pill, "border-rule text-muted-fg hover:bg-surface border")}>
            예약 취소
          </button>
        ) : full ? (
          <span className={cn(pill, "bg-rule text-muted-fg-faint cursor-default")}>마감</span>
        ) : (
          <button type="button" onClick={onJoin} disabled={disabled} className={cn(pill, "bg-cta inline-flex items-center gap-1.5 text-white")}>
            {busy && <Loader2 aria-hidden className="size-3.5 animate-spin" />}
            예약하기
          </button>
        )}
      </div>
    </li>
  );
}
