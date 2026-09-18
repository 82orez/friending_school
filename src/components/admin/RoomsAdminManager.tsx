"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, Loader2, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fmtTime, formatDateKo } from "@/lib/availability";
import { fmtRoomEnd, seatHeld, NO_SHOW_GRACE_MIN } from "@/lib/room-time";
import { canEnterClass, kstDateMinToMs } from "@/lib/classtime";
import { kstDateText } from "@/lib/kst";
import { frienderLabel } from "@/lib/prep";
import { seriesKeyOf, weekdaysLabelOf } from "@/lib/room-series";
import { roomLevelLabelKo } from "@/data/room-levels";
import { deleteRoomAsAdmin, deleteRoomSeriesAsAdmin } from "@/app/admin/actions";
import AdminRoomDetailModal from "@/components/admin/AdminRoomDetailModal";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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

export type AdminRoomParticipant = {
  user_id: string;
  user_name: string | null; // 예약 시점 스냅샷
  entered_at: string | null; // 첫 입장 시각(sticky) — 노쇼 판정 기준
  created_at: string; // 예약 시각
};

export type AdminRoom = {
  id: string;
  friender_id: string;
  friender_name: string | null; // 표시 스냅샷(개명하면 stale)
  friender_nickname: string | null;
  friender_phone: string | null; // profiles 최신값(연락용)
  friender_email: string;
  series_id: string | null; // 같은 시리즈로 개설된 회차 묶음(null이면 전환 이전 단발 방)
  title: string; // 시리즈 이름
  description: string | null;
  level: string;
  capacity: number;
  topic: string | null; // 회차 주제(선택)
  session_date: string; // KST YYYY-MM-DD
  start_min: number;
  duration_min: number;
  created_at: string;
  participants: AdminRoomParticipant[]; // 예약 순
};

// 회차(방 행)의 유일한 '상태'는 시간에서 파생된다 — friender_rooms에는 status·is_visible 컬럼이 없다
// (is_visible은 20260820220759에서 제거). 취소 = 하드 삭제뿐.
type TimeState = "live" | "upcoming" | "past";

// 파생값을 얹은 회차. 노쇼·예약 수는 now에 따라 변하므로 렌더마다 다시 만든다.
type RoomRow = AdminRoom & { state: TimeState; reserved: number; noShows: number; startMs: number; endMs: number };

// 시리즈(=프렌더가 개설한 '방') 상태 — 회차 상태에서 파생.
// live: 입장 시간대 회차가 있음 / open: 아직 남은 회차가 있음 / ended: 모든 회차 종료.
type SeriesState = "live" | "open" | "ended";

// 목록의 한 행 = 시리즈 하나. 회차는 펼쳐서 본다(프렌더 방 관리 /friender/rooms와 같은 묶음).
type SeriesRow = {
  key: string; // seriesKeyOf — series_id ?? 단발 방의 id
  last: RoomRow; // 대표 회차(마지막) — 공통값(이름·소개·난이도·정원)은 이 회차 기준
  sessions: RoomRow[]; // 일시 오름차순
  next: RoomRow | null; // 진행 중이거나 다음에 열릴 회차
  weekdays: string;
  timeLabel: string; // 회차 시각이 모두 같을 때만 "14:00~14:40", 아니면 "회차별 상이"
  remaining: number; // 끝나지 않은 회차 수
  reserved: number; // 끝나지 않은 회차의 예약 합(노쇼 제외)
  totalParticipants: number; // 전 회차 예약 행 수(삭제 안내용)
  noShows: number;
  state: SeriesState;
  createdAt: string; // 최초 개설 시각
};

const STATE_LABEL: Record<TimeState, string> = { live: "진행 중", upcoming: "예정", past: "지난" };
const SERIES_STATE_LABEL: Record<SeriesState, string> = { live: "진행 중", open: "운영 중", ended: "종료" };
// 라이브 초록은 대응 토큰이 없어 프렌딩 홈(/)과 같은 arbitrary hex 예외를 쓴다.
const STATE_BADGE: Record<TimeState, string> = {
  live: "bg-[#eafff1] text-[#22c55e]",
  upcoming: "bg-accent-blue-soft text-accent-blue-ink",
  past: "bg-rule text-muted-fg",
};
const SERIES_STATE_BADGE: Record<SeriesState, string> = { live: STATE_BADGE.live, open: STATE_BADGE.upcoming, ended: STATE_BADGE.past };
// 기본 정렬: 진행 중 → 운영 중(다음 회차 빠른 순) → 종료(최근 종료 순)
const SERIES_STATE_ORDER: Record<SeriesState, number> = { live: 0, open: 1, ended: 2 };

type SortKey = "next" | "title" | "friender" | "level" | "reserved" | "noshow" | "created_at";

// 비교값은 전부 문자열(EnrollmentsManager·MembersManager와 같은 규약).
// ⚠️ 숫자도 문자열로 비교되므로 zero-pad 하지 않으면 10 < 9 가 된다.
const SORT_VALUE: Record<SortKey, (s: SeriesRow) => string> = {
  next: (s) => (s.next ? `${s.next.session_date}${String(s.next.start_min).padStart(4, "0")}` : ""),
  title: (s) => s.last.title,
  friender: (s) => frienderLabel(s.last.friender_name, s.last.friender_nickname),
  level: (s) => roomLevelLabelKo(s.last.level),
  reserved: (s) => String(s.reserved).padStart(4, "0"),
  noshow: (s) => String(s.noShows).padStart(4, "0"),
  created_at: (s) => s.createdAt,
};

// "2026.09.19 ~ 10.16" — 같은 해면 끝 날짜의 연도를 생략한다.
function periodLabel(first: string, last: string): string {
  const f = first.replace(/-/g, ".");
  if (first === last) return f;
  return `${f} ~ ${first.slice(0, 4) === last.slice(0, 4) ? last.slice(5).replace("-", ".") : last.replace(/-/g, ".")}`;
}

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub: string; accent?: boolean }) {
  return (
    <div className="border-rule rounded-xl border bg-white p-5">
      <p className="text-muted-fg-faint text-xs font-semibold">{label}</p>
      <p className={cn("mt-1 text-2xl font-extrabold", accent ? "text-brand" : "text-ink")}>{value}</p>
      <p className="text-muted-fg-faint mt-0.5 text-xs">{sub}</p>
    </div>
  );
}

export default function RoomsAdminManager({ rooms }: { rooms: AdminRoom[] }) {
  const router = useRouter();
  const [list, setList] = useState(rooms);
  useEffect(() => setList(rooms), [rooms]);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | SeriesState>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  // 펼침 토글 — 검색으로 자동 펼쳐진 행을 다시 접을 수 있도록 '자동 펼침'과 XOR로 쓴다.
  const [toggled, setToggled] = useState<Set<string>>(() => new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RoomRow | null>(null);
  const [deleteSeriesTarget, setDeleteSeriesTarget] = useState<SeriesRow | null>(null);
  const [reason, setReason] = useState("");
  const [busy, startBusy] = useTransition();

  // 1분 틱 — 입장 시간창 진입/노쇼 유예 경과가 새로고침 없이 반영된다
  // (RoomsManager·FriendingRooms와 같은 방식).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const toggleSort = (key: SortKey) =>
    setSort((prev) => (prev?.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const rows: RoomRow[] = useMemo(
    () =>
      list.map((r) => {
        const startMs = kstDateMinToMs(r.session_date, r.start_min);
        // ⚠️ 종료는 반드시 start_min + duration_min을 kstDateMinToMs에 넣어 절대 ms로 — 자정을 넘기는 방
        //    (23:30 + 120분 → 익일 01:30)을 session_date 비교로는 놓친다.
        const endMs = kstDateMinToMs(r.session_date, r.start_min + r.duration_min);
        // 상태 판정은 프렌딩 홈(/)의 canEnter 기준을 따른다(실제 시작 기준 isLive가 아니라).
        // ⚠️ isLive로 나누면 "진행 중인데 입장은 못 하는" 15분 구간이 생겨 회원 화면과 어긋난다
        //    (프렌딩 홈(/)이 같은 이유로 폐기한 방식). 지난 방 경계(now > endMs)는 /friender/rooms와 동일.
        const state: TimeState = now > endMs ? "past" : canEnterClass(now, startMs, endMs) ? "live" : "upcoming";
        // 노쇼(시작 + 유예까지 미입장)는 자리를 반환한 것으로 본다 — 프렌딩 홈(/)·/mypage/rooms·
        // /friender/rooms·join_friender_room RPC가 모두 같은 규칙이라 카운트가 어긋나지 않는다.
        const reserved = r.participants.filter((p) => seatHeld(p.entered_at, startMs, now)).length;
        return { ...r, state, reserved, noShows: r.participants.length - reserved, startMs, endMs };
      }),
    [list, now],
  );

  // 시리즈로 묶는다 — 전환 이전 단발 방은 series_id가 null이라 자기 id가 곧 키(1회차 시리즈).
  // ⚠️ 공통값은 **마지막 회차**를 대표로 쓴다(/friender/rooms와 같은 규칙: 일괄 수정이 미시작 회차에만
  //    반영되므로 첫 회차를 대표로 삼으면 옛 이름이 뜬다).
  // ⚠️ 서버 쿼리가 최신 500회차 cap이라 아주 오래된 시리즈는 앞 회차가 잘려 보일 수 있다.
  const series: SeriesRow[] = useMemo(() => {
    const byKey = new Map<string, RoomRow[]>();
    for (const r of rows) {
      const key = seriesKeyOf(r);
      const arr = byKey.get(key);
      if (arr) arr.push(r);
      else byKey.set(key, [r]);
    }
    return Array.from(byKey.entries()).map(([key, arr]) => {
      const sessions = arr.slice().sort((a, b) => a.startMs - b.startMs);
      const last = sessions[sessions.length - 1];
      const open = sessions.filter((s) => s.state !== "past");
      const sameTime = sessions.every((s) => s.start_min === last.start_min && s.duration_min === last.duration_min);
      return {
        key,
        last,
        sessions,
        next: open[0] ?? null,
        weekdays: weekdaysLabelOf(sessions.map((s) => s.session_date)),
        timeLabel: sameTime ? `${fmtTime(last.start_min)}~${fmtRoomEnd(last.start_min + last.duration_min)}` : "회차별 시각 상이",
        remaining: open.length,
        reserved: open.reduce((sum, s) => sum + s.reserved, 0),
        totalParticipants: sessions.reduce((sum, s) => sum + s.participants.length, 0),
        noShows: sessions.reduce((sum, s) => sum + s.noShows, 0),
        state: sessions.some((s) => s.state === "live") ? "live" : open.length > 0 ? "open" : "ended",
        createdAt: sessions.reduce((min, s) => (s.created_at < min ? s.created_at : min), sessions[0].created_at),
      } satisfies SeriesRow;
    });
  }, [rows]);

  const counts = useMemo(() => {
    const c = { all: series.length, live: 0, open: 0, ended: 0 };
    for (const s of series) c[s.state] += 1;
    return c;
  }, [series]);

  const totalNoShows = useMemo(() => series.reduce((sum, s) => sum + s.noShows, 0), [series]);

  const q = query.trim().toLowerCase();

  // 검색 결과: 시리즈 → 자동 펼침 여부. 회차 단위 필드(주제·예약자)로 걸렸으면 펼쳐서 보여준다.
  const { filtered, autoOpen } = useMemo(() => {
    const autoOpen = new Set<string>();
    const base = series.filter((s) => {
      if (filter !== "all" && s.state !== filter) return false;
      if (!q) return true;
      const head = [s.last.title, s.last.friender_name ?? "", s.last.friender_nickname ?? "", s.last.friender_email].join(" ").toLowerCase();
      // 참가자 이름까지 대상 — "이 회원이 어느 방에 들어갔나"를 이 탭에서 답할 수 있어야 한다.
      const inSession = s.sessions.some((r) =>
        [r.title, r.topic ?? "", ...r.participants.map((p) => p.user_name ?? "")].join(" ").toLowerCase().includes(q),
      );
      if (inSession && !head.includes(q)) autoOpen.add(s.key);
      return head.includes(q) || inSession;
    });
    if (!sort) {
      return {
        autoOpen,
        filtered: [...base].sort(
          (a, b) =>
            SERIES_STATE_ORDER[a.state] - SERIES_STATE_ORDER[b.state] ||
            (a.state === "ended" ? b.last.startMs - a.last.startMs : (a.next?.startMs ?? 0) - (b.next?.startMs ?? 0)),
        ),
      };
    }
    // 빈 값은 방향과 무관하게 항상 뒤로.
    const val = (s: SeriesRow) => SORT_VALUE[sort.key](s).trim();
    return {
      autoOpen,
      filtered: [...base].sort((a, b) => {
        const av = val(a);
        const bv = val(b);
        if (!av && !bv) return 0;
        if (!av) return 1;
        if (!bv) return -1;
        const cmp = av.localeCompare(bv, "ko");
        return sort.dir === "asc" ? cmp : -cmp;
      }),
    };
  }, [series, q, filter, sort]);

  const isOpen = (key: string) => toggled.has(key) !== autoOpen.has(key);
  const toggleOpen = (key: string) =>
    setToggled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  // 검색어가 바뀌면 수동 토글을 비운다 — 이전 검색의 접힘 상태가 새 결과에 섞이지 않게.
  useEffect(() => setToggled(new Set()), [q]);

  const detail = useMemo(() => rows.find((r) => r.id === detailId) ?? null, [rows, detailId]);
  const closeDetail = useCallback(() => setDetailId(null), []);

  const closeDialogs = () => {
    setDeleteTarget(null);
    setDeleteSeriesTarget(null);
    setReason("");
  };

  // 다이얼로그를 닫으며 state를 비우므로 대상·사유를 먼저 스냅샷한다
  // (base-nova는 AlertDialogAction이 자동으로 닫지 않는다 — PrepCoursesManager와 같은 패턴).
  const confirmDelete = () => {
    const target = deleteTarget;
    const note = reason.trim();
    closeDialogs();
    if (!target) return;
    startBusy(async () => {
      const res = await deleteRoomAsAdmin(target.id, note);
      if (res.ok) {
        setList((prev) => prev.filter((x) => x.id !== target.id));
        if (detailId === target.id) setDetailId(null);
        toast.success("회차를 삭제했습니다.");
        router.refresh();
      } else {
        toast.error(res.error ?? "오류가 발생했습니다.");
      }
    });
  };

  const confirmDeleteSeries = () => {
    const target = deleteSeriesTarget;
    const note = reason.trim();
    closeDialogs();
    if (!target) return;
    startBusy(async () => {
      const res = await deleteRoomSeriesAsAdmin(target.key, note);
      if (res.ok) {
        setList((prev) => prev.filter((x) => seriesKeyOf(x) !== target.key));
        if (detailId && target.sessions.some((s) => s.id === detailId)) setDetailId(null);
        toast.success("연습방을 삭제했습니다.");
        router.refresh();
      } else {
        toast.error(res.error ?? "오류가 발생했습니다.");
      }
    });
  };

  const FILTERS: { key: "all" | SeriesState; label: string }[] = [
    { key: "all", label: "전체" },
    { key: "live", label: SERIES_STATE_LABEL.live },
    { key: "open", label: SERIES_STATE_LABEL.open },
    { key: "ended", label: SERIES_STATE_LABEL.ended },
  ];

  return (
    <TooltipProvider>
      <div>
        <h1 className="text-ink text-2xl font-extrabold">연습방 관리</h1>
        <p className="text-muted-fg mt-1 text-sm">
          프렌더가 개설한 무료 연습방 목록입니다. 방을 펼치면 회차별 예약자 명단을 볼 수 있고, 문제가 있는 방은 예약자가 있어도 회차별 또는 방 전체를
          삭제할 수 있습니다(프렌더와 예약자에게 문자로 안내됩니다).
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="전체 방" value={counts.all} sub={`회차 ${rows.length}개 (최근 500회차)`} />
          <StatCard label="진행 중" value={counts.live} sub="입장 시간대 회차 있음" accent />
          <StatCard label="운영 중" value={counts.open} sub="남은 회차 있음" />
          <StatCard label="미입장" value={totalNoShows} sub={`유예 ${NO_SHOW_GRACE_MIN}분 경과`} />
        </div>

        <div className="mt-5 flex flex-col gap-3">
          <div className="border-rule flex items-center gap-2 rounded-lg border bg-white px-3">
            <Search className="text-muted-fg-faint size-4" aria-hidden />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="방 이름·회차 주제, 프렌더 이름/이메일, 예약자 이름 검색..."
              className="h-10 flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <div className="flex [scrollbar-width:none] gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                  filter === f.key ? "bg-ink border-ink text-white" : "border-rule text-muted-fg bg-white",
                )}>
                {f.label} <span className={cn("ml-0.5", filter === f.key ? "text-white/70" : "text-muted-fg-faint")}>{counts[f.key]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="border-rule mt-4 overflow-hidden rounded-xl border bg-white">
          {filtered.length === 0 ? (
            <p className="text-muted-fg px-6 py-12 text-center text-sm">표시할 연습방이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] border-collapse text-sm">
                <thead>
                  <tr className="border-rule bg-surface text-muted-fg-faint border-b text-left text-xs font-semibold">
                    <SortHeader label="방" sortKey="title" sort={sort} onSort={toggleSort} className="px-4 py-2.5 md:px-6" />
                    <SortHeader label="프렌더" sortKey="friender" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
                    <SortHeader label="난이도" sortKey="level" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
                    <th className="px-4 py-2.5">기간</th>
                    <SortHeader label="다음 회차" sortKey="next" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
                    <SortHeader label="예약" sortKey="reserved" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
                    <SortHeader label="미입장" sortKey="noshow" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
                    <th className="px-4 py-2.5">상태</th>
                    <SortHeader label="개설일" sortKey="created_at" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
                    <th className="px-4 py-2.5 text-right md:px-6">
                      <span className="sr-only">관리</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => {
                    const open = isOpen(s.key);
                    return (
                      <Fragment key={s.key}>
                        <tr
                          className={cn(
                            "border-rule border-b last:border-b-0",
                            // 남은 회차에 예약이 있는 방은 한눈에 구분되게 강조(RoomsManager와 같은 규칙).
                            s.reserved > 0 && "border-l-cta bg-cta/[0.04] border-l-4",
                            s.state === "ended" && "opacity-60",
                          )}>
                          <td className="text-ink max-w-[260px] px-4 py-3.5 align-middle md:px-6">
                            <button
                              type="button"
                              onClick={() => toggleOpen(s.key)}
                              aria-expanded={open}
                              className="group flex w-full items-start gap-1.5 text-left">
                              <ChevronDown
                                aria-hidden
                                className={cn(
                                  "text-muted-fg-faint group-hover:text-ink mt-0.5 size-4 shrink-0 transition-transform",
                                  !open && "-rotate-90",
                                )}
                              />
                              <span className="min-w-0">
                                <span className="block truncate font-semibold">{s.last.title}</span>
                                <span className="text-muted-fg-faint block truncate text-xs">
                                  {s.weekdays} · {s.timeLabel}
                                </span>
                              </span>
                            </button>
                          </td>
                          <td className="text-muted-fg px-4 py-3.5 align-middle whitespace-nowrap">
                            <span className="block">{frienderLabel(s.last.friender_name, s.last.friender_nickname)}</span>
                            {s.last.friender_email && <span className="text-muted-fg-faint block text-xs">{s.last.friender_email}</span>}
                          </td>
                          <td className="px-4 py-3.5 align-middle whitespace-nowrap">
                            {/* 난이도 — 글자만 빨강(text-brand). 앱 전체의 난이도 표시가 같은 색이다. */}
                            <span className="bg-brand/10 text-brand rounded-full px-2 py-0.5 text-xs font-bold">
                              {roomLevelLabelKo(s.last.level)}
                            </span>
                          </td>
                          <td className="text-muted-fg px-4 py-3.5 align-middle whitespace-nowrap">
                            <span className="block">{periodLabel(s.sessions[0].session_date, s.last.session_date)}</span>
                            <span className="text-muted-fg-faint block text-xs">
                              총 {s.sessions.length}회 · 남은 {s.remaining}회
                            </span>
                          </td>
                          <td className="text-ink px-4 py-3.5 align-middle whitespace-nowrap">
                            {s.next ? (
                              <>
                                <span className="block font-semibold">{formatDateKo(s.next.session_date)}</span>
                                <span className="text-muted-fg-faint block text-xs">{fmtTime(s.next.start_min)}</span>
                              </>
                            ) : (
                              <span className="text-muted-fg-faint">-</span>
                            )}
                          </td>
                          <td
                            className={cn(
                              "px-4 py-3.5 align-middle whitespace-nowrap",
                              s.reserved > 0 ? "text-cta font-bold" : "text-muted-fg-faint",
                            )}>
                            {s.reserved}건
                            {s.next && (
                              <span className="text-muted-fg-faint block text-xs font-normal">
                                다음 {s.next.reserved}/{s.next.capacity}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 align-middle whitespace-nowrap">
                            {s.noShows > 0 ? (
                              <span className="bg-rule/60 text-muted-fg rounded-full px-2 py-0.5 text-xs font-bold">{s.noShows}</span>
                            ) : (
                              <span className="text-muted-fg-faint">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 align-middle">
                            <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap", SERIES_STATE_BADGE[s.state])}>
                              {SERIES_STATE_LABEL[s.state]}
                            </span>
                          </td>
                          <td className="text-muted-fg-faint px-4 py-3.5 align-middle text-xs whitespace-nowrap">{kstDateText(s.createdAt)}</td>
                          <td className="px-4 py-3.5 text-right align-middle whitespace-nowrap md:px-6">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => toggleOpen(s.key)}
                                aria-expanded={open}
                                className="border-rule text-muted-fg hover:bg-surface shrink-0 rounded-md border px-2.5 py-1.5 text-xs font-bold transition-colors">
                                회차 {s.sessions.length}
                              </button>
                              <Tooltip>
                                <TooltipTrigger
                                  type="button"
                                  onClick={() => setDeleteSeriesTarget(s)}
                                  disabled={busy}
                                  aria-label="방 전체 삭제"
                                  className="border-brand/40 text-brand hover:bg-brand/5 shrink-0 rounded-md border p-2 transition-colors disabled:opacity-60">
                                  <Trash2 aria-hidden className="size-4" />
                                </TooltipTrigger>
                                <TooltipContent>방 전체 삭제</TooltipContent>
                              </Tooltip>
                            </div>
                          </td>
                        </tr>
                        {open && (
                          <tr className="border-rule border-b last:border-b-0">
                            <td colSpan={10} className="bg-surface px-4 py-3 md:px-6">
                              <SessionTable
                                sessions={s.sessions}
                                busy={busy}
                                onDetail={(id) => setDetailId(id)}
                                onDelete={(r) => setDeleteTarget(r)}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {busy && (
          <p className="text-muted-fg mt-3 flex items-center gap-1.5 text-sm">
            <Loader2 aria-hidden className="size-4 animate-spin" /> 처리 중...
          </p>
        )}

        <AdminRoomDetailModal room={detail} now={now} onDelete={() => detail && setDeleteTarget(detail)} onClose={closeDetail} />

        {/* 회차 1개 삭제 */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && closeDialogs()}>
          {/* 상세 모달 패널이 z-[120]이라 그 위로 올린다. */}
          <AlertDialogContent className="z-[130]">
            <AlertDialogHeader>
              <AlertDialogTitle>이 회차를 삭제할까요?</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget && (
                  <>
                    「{deleteTarget.title}」 · {frienderLabel(deleteTarget.friender_name, deleteTarget.friender_nickname)} ·{" "}
                    {formatDateKo(deleteTarget.session_date)} {fmtTime(deleteTarget.start_min)}
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {deleteTarget && (
              // ⚠️ AlertDialogDescription은 <p>라 아래 블록들은 그 바깥 형제로 둔다.
              <div className="space-y-2 text-sm">
                {deleteTarget.state === "live" && (
                  <p className="border-brand/30 bg-brand/5 text-brand rounded-lg border px-3 py-2 font-semibold">
                    지금 입장 시간대인 회차입니다. 참여 중인 회원이 있을 수 있어요.
                  </p>
                )}
                <p className="text-muted-fg">
                  {deleteTarget.participants.length > 0
                    ? `예약 ${deleteTarget.participants.length}건이 함께 삭제되며 되돌릴 수 없습니다. 번호가 등록된 예약자에게 취소 안내 문자가 발송됩니다.`
                    : "되돌릴 수 없습니다."}{" "}
                  같은 방의 다른 회차와 작성된 후기·평점은 그대로 남습니다.
                </p>
                <ReasonInput value={reason} onChange={setReason} />
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} className="bg-brand text-white hover:opacity-90">
                삭제
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* 방(시리즈) 전체 삭제 */}
        <AlertDialog open={!!deleteSeriesTarget} onOpenChange={(o) => !o && closeDialogs()}>
          <AlertDialogContent className="z-[130]">
            <AlertDialogHeader>
              <AlertDialogTitle>연습방 전체를 삭제할까요?</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteSeriesTarget && (
                  <>
                    「{deleteSeriesTarget.last.title}」 ·{" "}
                    {frienderLabel(deleteSeriesTarget.last.friender_name, deleteSeriesTarget.last.friender_nickname)} ·{" "}
                    {deleteSeriesTarget.sessions.length}개 회차
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {deleteSeriesTarget && (
              <div className="space-y-2 text-sm">
                {deleteSeriesTarget.state === "live" && (
                  <p className="border-brand/30 bg-brand/5 text-brand rounded-lg border px-3 py-2 font-semibold">
                    지금 입장 시간대인 회차가 있습니다. 참여 중인 회원이 있을 수 있어요.
                  </p>
                )}
                <p className="text-muted-fg">
                  모든 회차{deleteSeriesTarget.totalParticipants > 0 ? `와 예약 ${deleteSeriesTarget.totalParticipants}건` : ""}, 방 게시판 글이 함께
                  삭제되며 되돌릴 수 없습니다.
                  {deleteSeriesTarget.reserved > 0 && " 남은 회차 예약자에게는 1인 1통 취소 안내 문자가 발송됩니다."} 작성된 후기와 평점은 그대로
                  남습니다.
                </p>
                <ReasonInput value={reason} onChange={setReason} />
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDeleteSeries} className="bg-brand text-white hover:opacity-90">
                전체 삭제
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}

function ReasonInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={3}
      maxLength={1000}
      placeholder="삭제 사유 (선택) — 프렌더와 예약자에게 함께 전달됩니다."
      className="border-rule focus:border-accent-blue w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none"
    />
  );
}

// 펼친 시리즈의 회차 목록 — 회차 단위 상세(예약자 명단)·개별 삭제는 여기서.
function SessionTable({
  sessions,
  busy,
  onDetail,
  onDelete,
}: {
  sessions: RoomRow[];
  busy: boolean;
  onDetail: (id: string) => void;
  onDelete: (r: RoomRow) => void;
}) {
  return (
    <table className="border-rule w-full border-collapse overflow-hidden rounded-lg border bg-white text-sm">
      <thead>
        <tr className="border-rule text-muted-fg-faint border-b text-left text-xs font-semibold">
          <th className="w-12 px-3 py-2">회차</th>
          <th className="px-3 py-2">일시</th>
          <th className="px-3 py-2">주제</th>
          <th className="px-3 py-2">예약</th>
          <th className="px-3 py-2">미입장</th>
          <th className="px-3 py-2">상태</th>
          <th className="px-3 py-2 text-right">
            <span className="sr-only">관리</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {sessions.map((r, i) => (
          <tr key={r.id} className={cn("border-rule border-b last:border-b-0", r.state === "past" && "opacity-60")}>
            <td className="text-muted-fg-faint px-3 py-2.5 align-middle text-xs">{i + 1}</td>
            <td className="text-ink px-3 py-2.5 align-middle whitespace-nowrap">
              <span className="font-semibold">{formatDateKo(r.session_date)}</span>{" "}
              {/* ⚠️ 종료 시각은 fmtRoomEnd로 — 자정 넘김 방이 25:30으로 새는 것을 막는다. */}
              <span className="text-muted-fg-faint text-xs">
                {fmtTime(r.start_min)}~{fmtRoomEnd(r.start_min + r.duration_min)} ({r.duration_min}분)
              </span>
            </td>
            <td className="text-muted-fg max-w-[280px] px-3 py-2.5 align-middle">
              <span className="block truncate">{r.topic?.trim() || "-"}</span>
            </td>
            <td className={cn("px-3 py-2.5 align-middle whitespace-nowrap", r.reserved > 0 ? "text-cta font-bold" : "text-muted-fg-faint")}>
              {r.reserved}/{r.capacity}
            </td>
            <td className="px-3 py-2.5 align-middle whitespace-nowrap">
              {r.noShows > 0 ? (
                <span className="bg-rule/60 text-muted-fg rounded-full px-2 py-0.5 text-xs font-bold">{r.noShows}</span>
              ) : (
                <span className="text-muted-fg-faint">-</span>
              )}
            </td>
            <td className="px-3 py-2.5 align-middle">
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap", STATE_BADGE[r.state])}>{STATE_LABEL[r.state]}</span>
            </td>
            <td className="px-3 py-2.5 text-right align-middle whitespace-nowrap">
              <div className="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => onDetail(r.id)}
                  className="border-rule text-muted-fg hover:bg-surface shrink-0 rounded-md border px-2.5 py-1 text-xs font-bold transition-colors">
                  상세
                </button>
                <Tooltip>
                  <TooltipTrigger
                    type="button"
                    onClick={() => onDelete(r)}
                    disabled={busy}
                    aria-label="회차 삭제"
                    className="border-brand/40 text-brand hover:bg-brand/5 shrink-0 rounded-md border p-1.5 transition-colors disabled:opacity-60">
                    <Trash2 aria-hidden className="size-3.5" />
                  </TooltipTrigger>
                  <TooltipContent>회차 삭제</TooltipContent>
                </Tooltip>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// 클릭 시 asc→desc 토글. 다른 admin 매니저(MembersManager·EnrollmentsManager)와 동일한 헤더 UI.
function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" } | null;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort?.key === sortKey;
  const Icon = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th className={className} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(sortKey)} className="hover:text-ink inline-flex items-center gap-1 font-semibold transition-colors">
        {label}
        <Icon aria-hidden className={cn("size-3.5", active ? "text-ink" : "text-muted-fg-faint/60")} />
      </button>
    </th>
  );
}
