"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fmtTime, formatDateKo } from "@/lib/availability";
import { fmtRoomEnd, seatHeld, NO_SHOW_GRACE_MIN } from "@/lib/room-time";
import { canEnterClass, kstDateMinToMs } from "@/lib/classtime";
import { frienderLabel } from "@/lib/prep";
import { seriesKeyOf, weekdaysLabelOf } from "@/lib/room-series";
import { deleteRoomAsAdmin, deleteRoomSeriesAsAdmin } from "@/app/admin/actions";
import AdminRoomDetailModal from "@/components/admin/AdminRoomDetailModal";
import {
  SERIES_STATE_BADGE,
  SERIES_STATE_LABEL,
  periodLabel,
  type AdminRoom,
  type RoomRow,
  type SeriesRow,
  type SeriesState,
  type TimeState,
} from "@/components/admin/rooms-admin-shared";
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

export type { AdminRoom, AdminRoomParticipant } from "@/components/admin/rooms-admin-shared";

// 기본 정렬: 진행 중 → 운영 중(다음 회차 빠른 순) → 종료(최근 종료 순)
const SERIES_STATE_ORDER: Record<SeriesState, number> = { live: 0, open: 1, ended: 2 };

type SortKey = "title" | "friender" | "period";

// 비교값은 전부 문자열(EnrollmentsManager·MembersManager와 같은 규약).
const SORT_VALUE: Record<SortKey, (s: SeriesRow) => string> = {
  title: (s) => s.last.title,
  friender: (s) => frienderLabel(s.last.friender_name, s.last.friender_nickname),
  period: (s) => s.sessions[0].session_date,
};

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub: string; accent?: boolean }) {
  return (
    <div className="border-rule rounded-xl border bg-white p-5">
      <p className="text-muted-fg-faint text-xs font-semibold">{label}</p>
      <p className={cn("mt-1 text-2xl font-extrabold", accent ? "text-brand" : "text-ink")}>{value}</p>
      <p className="text-muted-fg-faint mt-0.5 text-xs">{sub}</p>
    </div>
  );
}

// 목록은 방(시리즈)당 한 행, 최소 정보(방·프렌더·기간·상태)만. 방 정보·회차·예약자 명단은 「상세」 모달에서.
export default function RoomsAdminManager({ rooms }: { rooms: AdminRoom[] }) {
  const router = useRouter();
  const [list, setList] = useState(rooms);
  useEffect(() => setList(rooms), [rooms]);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | SeriesState>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const [detailKey, setDetailKey] = useState<string | null>(null);
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
      const state: SeriesState = sessions.some((s) => s.state === "live") ? "live" : open.length > 0 ? "open" : "ended";
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
        state,
        createdAt: sessions.reduce((min, s) => (s.created_at < min ? s.created_at : min), sessions[0].created_at),
      };
    });
  }, [rows]);

  const counts = useMemo(() => {
    const c = { all: series.length, live: 0, open: 0, ended: 0 };
    for (const s of series) c[s.state] += 1;
    return c;
  }, [series]);

  const totalNoShows = useMemo(() => series.reduce((sum, s) => sum + s.noShows, 0), [series]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = series.filter((s) => {
      if (filter !== "all" && s.state !== filter) return false;
      if (!q) return true;
      // 회차 주제·예약자 이름까지 대상 — "이 회원이 어느 방에 들어갔나"를 이 탭에서 답할 수 있어야 한다
      // (어느 회차인지는 상세 모달에서 확인).
      const haystack = [
        s.last.title,
        s.last.friender_name ?? "",
        s.last.friender_nickname ?? "",
        s.last.friender_email,
        ...s.sessions.flatMap((r) => [r.title, r.topic ?? "", ...r.participants.map((p) => p.user_name ?? "")]),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
    if (!sort) {
      return [...base].sort(
        (a, b) =>
          SERIES_STATE_ORDER[a.state] - SERIES_STATE_ORDER[b.state] ||
          (a.state === "ended" ? b.last.startMs - a.last.startMs : (a.next?.startMs ?? 0) - (b.next?.startMs ?? 0)),
      );
    }
    const val = (s: SeriesRow) => SORT_VALUE[sort.key](s).trim();
    return [...base].sort((a, b) => {
      const cmp = val(a).localeCompare(val(b), "ko");
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [series, query, filter, sort]);

  // 모달에는 키만 들고 있고 최신 series에서 찾는다 — 회차 삭제가 곧바로 반영되고, 방이 사라지면 자동으로 닫힌다.
  const detail = useMemo(() => series.find((s) => s.key === detailKey) ?? null, [series, detailKey]);
  const closeDetail = useCallback(() => setDetailKey(null), []);

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
          프렌더가 개설한 무료 연습방 목록입니다. 「상세」에서 회차별 예약자 명단을 볼 수 있고, 문제가 있는 방은 예약자가 있어도 회차별 또는 방 전체를
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
              <table className="w-full min-w-[680px] border-collapse text-sm">
                <thead>
                  <tr className="border-rule bg-surface text-muted-fg-faint border-b text-left text-xs font-semibold">
                    <SortHeader label="방" sortKey="title" sort={sort} onSort={toggleSort} className="px-4 py-2.5 md:px-6" />
                    <SortHeader label="프렌더" sortKey="friender" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
                    <SortHeader label="기간" sortKey="period" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
                    <th className="px-4 py-2.5">상태</th>
                    <th className="px-4 py-2.5 text-right md:px-6">
                      <span className="sr-only">관리</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr
                      key={s.key}
                      className={cn(
                        "border-rule border-b last:border-b-0",
                        // 남은 회차에 예약이 있는 방은 한눈에 구분되게 강조(RoomsManager와 같은 규칙).
                        s.reserved > 0 && "border-l-cta bg-cta/[0.04] border-l-4",
                        s.state === "ended" && "opacity-60",
                      )}>
                      <td className="text-ink max-w-[320px] px-4 py-3.5 align-middle md:px-6">
                        <button type="button" onClick={() => setDetailKey(s.key)} className="block w-full text-left hover:underline">
                          <span className="block truncate font-semibold">{s.last.title}</span>
                        </button>
                        <span className="text-muted-fg-faint block truncate text-xs">
                          {s.weekdays} · {s.timeLabel}
                        </span>
                      </td>
                      <td className="text-muted-fg px-4 py-3.5 align-middle whitespace-nowrap">
                        {frienderLabel(s.last.friender_name, s.last.friender_nickname)}
                      </td>
                      <td className="text-muted-fg px-4 py-3.5 align-middle whitespace-nowrap">
                        <span className="block">{periodLabel(s.sessions[0].session_date, s.last.session_date)}</span>
                        <span className="text-muted-fg-faint block text-xs">
                          총 {s.sessions.length}회 · 남은 {s.remaining}회
                        </span>
                      </td>
                      <td className="px-4 py-3.5 align-middle">
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap", SERIES_STATE_BADGE[s.state])}>
                          {SERIES_STATE_LABEL[s.state]}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right align-middle whitespace-nowrap md:px-6">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setDetailKey(s.key)}
                            className="border-rule text-muted-fg hover:bg-surface shrink-0 rounded-md border px-2.5 py-1.5 text-xs font-bold transition-colors">
                            상세
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
                  ))}
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

        <AdminRoomDetailModal
          series={detail}
          now={now}
          busy={busy}
          onDeleteSession={setDeleteTarget}
          onDeleteSeries={() => detail && setDeleteSeriesTarget(detail)}
          onClose={closeDetail}
        />

        {/* 회차 1개 삭제 — 상세 모달 패널이 z-[120]이라 다이얼로그는 z-[130]으로 그 위에 띄운다. */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && closeDialogs()}>
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
