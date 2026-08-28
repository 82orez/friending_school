"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fmtTime, formatDateKo } from "@/lib/availability";
import { fmtRoomEnd, seatHeld, NO_SHOW_GRACE_MIN } from "@/lib/room-time";
import { canEnterClass, kstDateMinToMs } from "@/lib/classtime";
import { kstDateText } from "@/lib/kst";
import { frienderLabel } from "@/lib/prep";
import { roomLevelLabelKo } from "@/data/room-levels";
import { deleteRoomAsAdmin } from "@/app/admin/actions";
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
  title: string;
  description: string | null;
  level: string;
  capacity: number;
  session_date: string; // KST YYYY-MM-DD
  start_min: number;
  duration_min: number;
  created_at: string;
  participants: AdminRoomParticipant[]; // 예약 순
};

// 방의 유일한 '상태'는 시간에서 파생된다 — friender_rooms에는 status·is_visible 컬럼이 없다
// (is_visible은 20260820220759에서 제거). 취소 = 하드 삭제뿐.
type TimeState = "live" | "upcoming" | "past";

// 파생값을 얹은 행. 노쇼·예약 수는 now에 따라 변하므로 렌더마다 다시 만든다.
type RoomRow = AdminRoom & { state: TimeState; reserved: number; noShows: number; startMs: number; endMs: number };

const STATE_LABEL: Record<TimeState, string> = { live: "진행 중", upcoming: "예정", past: "지난" };
// 라이브 초록은 대응 토큰이 없어 프렌딩 홈(/)과 같은 arbitrary hex 예외를 쓴다.
const STATE_BADGE: Record<TimeState, string> = {
  live: "bg-[#eafff1] text-[#22c55e]",
  upcoming: "bg-accent-blue-soft text-accent-blue-ink",
  past: "bg-rule text-muted-fg",
};

type SortKey = "session" | "title" | "friender" | "level" | "reserved" | "noshow" | "created_at";

// 비교값은 전부 문자열(EnrollmentsManager·MembersManager와 같은 규약).
// ⚠️ 숫자도 문자열로 비교되므로 zero-pad 하지 않으면 10 < 9 가 된다.
const SORT_VALUE: Record<SortKey, (r: RoomRow) => string> = {
  session: (r) => `${r.session_date}${String(r.start_min).padStart(4, "0")}`,
  title: (r) => r.title,
  friender: (r) => frienderLabel(r.friender_name, r.friender_nickname),
  level: (r) => roomLevelLabelKo(r.level),
  reserved: (r) => String(r.reserved).padStart(4, "0"),
  noshow: (r) => String(r.noShows).padStart(4, "0"),
  created_at: (r) => r.created_at,
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

export default function RoomsAdminManager({ rooms }: { rooms: AdminRoom[] }) {
  const router = useRouter();
  const [list, setList] = useState(rooms);
  useEffect(() => setList(rooms), [rooms]);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | TimeState>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RoomRow | null>(null);
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

  const counts = useMemo(() => {
    const c = { all: rows.length, live: 0, upcoming: 0, past: 0 };
    for (const r of rows) c[r.state] += 1;
    return c;
  }, [rows]);

  const totalNoShows = useMemo(() => rows.reduce((sum, r) => sum + r.noShows, 0), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = rows.filter((r) => {
      if (filter !== "all" && r.state !== filter) return false;
      if (!q) return true;
      // 참가자 이름까지 대상 — "이 회원이 어느 방에 들어갔나"를 이 탭에서 답할 수 있어야 한다.
      const haystack = [r.title, r.friender_name ?? "", r.friender_nickname ?? "", r.friender_email, ...r.participants.map((p) => p.user_name ?? "")]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
    if (!sort) return base;
    // 빈 값은 방향과 무관하게 항상 뒤로.
    const val = (r: RoomRow) => SORT_VALUE[sort.key](r).trim();
    return [...base].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      const cmp = av.localeCompare(bv, "ko");
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [rows, query, filter, sort]);

  const detail = useMemo(() => filtered.find((r) => r.id === detailId) ?? rows.find((r) => r.id === detailId) ?? null, [filtered, rows, detailId]);
  const closeDetail = useCallback(() => setDetailId(null), []);

  // 다이얼로그를 닫으며 state를 비우므로 대상·사유를 먼저 스냅샷한다
  // (base-nova는 AlertDialogAction이 자동으로 닫지 않는다 — PrepCoursesManager와 같은 패턴).
  const confirmDelete = () => {
    const target = deleteTarget;
    const note = reason.trim();
    setDeleteTarget(null);
    setReason("");
    if (!target) return;
    startBusy(async () => {
      const res = await deleteRoomAsAdmin(target.id, note);
      if (res.ok) {
        setList((prev) => prev.filter((x) => x.id !== target.id));
        if (detailId === target.id) setDetailId(null);
        toast.success("방을 삭제했습니다.");
        router.refresh();
      } else {
        toast.error(res.error ?? "오류가 발생했습니다.");
      }
    });
  };

  const FILTERS: { key: "all" | TimeState; label: string }[] = [
    { key: "all", label: "전체" },
    { key: "live", label: STATE_LABEL.live },
    { key: "upcoming", label: STATE_LABEL.upcoming },
    { key: "past", label: STATE_LABEL.past },
  ];

  return (
    <TooltipProvider>
      <div>
        <h1 className="text-ink text-2xl font-extrabold">연습방 관리</h1>
        <p className="text-muted-fg mt-1 text-sm">
          프렌더가 개설한 무료 연습방 목록입니다. 예약자 명단은 이 화면에서만 볼 수 있고, 문제가 있는 방은 예약자가 있어도 삭제할 수 있습니다(프렌더와
          예약자에게 문자로 안내됩니다).
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="전체 방" value={counts.all} sub="최근 500개" />
          <StatCard label="진행 중" value={counts.live} sub="입장 시간대" accent />
          <StatCard label="예정" value={counts.upcoming} sub="아직 시작 전" />
          <StatCard label="미입장" value={totalNoShows} sub={`유예 ${NO_SHOW_GRACE_MIN}분 경과`} />
        </div>

        <div className="mt-5 flex flex-col gap-3">
          <div className="border-rule flex items-center gap-2 rounded-lg border bg-white px-3">
            <Search className="text-muted-fg-faint size-4" aria-hidden />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="주제, 프렌더 이름/이메일, 예약자 이름 검색..."
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
              <table className="w-full min-w-[1000px] border-collapse text-sm">
                <thead>
                  <tr className="border-rule bg-surface text-muted-fg-faint border-b text-left text-xs font-semibold">
                    <SortHeader label="일시" sortKey="session" sort={sort} onSort={toggleSort} className="px-4 py-2.5 md:px-6" />
                    <SortHeader label="주제" sortKey="title" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
                    <SortHeader label="프렌더" sortKey="friender" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
                    <SortHeader label="난이도" sortKey="level" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
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
                  {filtered.map((r) => (
                    <tr
                      key={r.id}
                      className={cn(
                        "border-rule border-b last:border-b-0",
                        // 예약이 들어온 방은 한눈에 구분되게 강조(RoomsManager와 같은 규칙).
                        r.reserved > 0 && "border-l-cta bg-cta/[0.04] border-l-4",
                        r.state === "past" && "opacity-60",
                      )}>
                      <td className="text-ink px-4 py-3.5 align-middle whitespace-nowrap md:px-6">
                        <span className="block font-semibold">{formatDateKo(r.session_date)}</span>
                        {/* ⚠️ 종료 시각은 fmtRoomEnd로 — 자정 넘김 방이 25:30으로 새는 것을 막는다. */}
                        <span className="text-muted-fg-faint block text-xs">
                          {fmtTime(r.start_min)}~{fmtRoomEnd(r.start_min + r.duration_min)} ({r.duration_min}분)
                        </span>
                      </td>
                      <td className="text-ink max-w-[240px] truncate px-4 py-3.5 align-middle font-semibold">{r.title}</td>
                      <td className="text-muted-fg px-4 py-3.5 align-middle whitespace-nowrap">
                        {frienderLabel(r.friender_name, r.friender_nickname)}
                      </td>
                      <td className="px-4 py-3.5 align-middle whitespace-nowrap">
                        <span className="bg-surface text-muted-fg rounded-full px-2 py-0.5 text-xs font-bold">{roomLevelLabelKo(r.level)}</span>
                      </td>
                      <td className={cn("px-4 py-3.5 align-middle whitespace-nowrap", r.reserved > 0 ? "text-cta font-bold" : "text-muted-fg-faint")}>
                        {r.reserved}/{r.capacity}
                      </td>
                      <td className="px-4 py-3.5 align-middle whitespace-nowrap">
                        {r.noShows > 0 ? (
                          <span className="bg-rule/60 text-muted-fg rounded-full px-2 py-0.5 text-xs font-bold">{r.noShows}</span>
                        ) : (
                          <span className="text-muted-fg-faint">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 align-middle">
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap", STATE_BADGE[r.state])}>
                          {STATE_LABEL[r.state]}
                        </span>
                      </td>
                      <td className="text-muted-fg-faint px-4 py-3.5 align-middle text-xs whitespace-nowrap">{kstDateText(r.created_at)}</td>
                      <td className="px-4 py-3.5 text-right align-middle whitespace-nowrap md:px-6">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setDetailId(r.id)}
                            className="border-rule text-muted-fg hover:bg-surface shrink-0 rounded-md border px-2.5 py-1.5 text-xs font-bold transition-colors">
                            상세
                          </button>
                          <Tooltip>
                            <TooltipTrigger
                              type="button"
                              onClick={() => setDeleteTarget(r)}
                              disabled={busy}
                              aria-label="삭제"
                              className="border-brand/40 text-brand hover:bg-brand/5 shrink-0 rounded-md border p-2 transition-colors disabled:opacity-60">
                              <Trash2 aria-hidden className="size-4" />
                            </TooltipTrigger>
                            <TooltipContent>삭제</TooltipContent>
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

        <AdminRoomDetailModal room={detail} now={now} onDelete={() => detail && setDeleteTarget(detail)} onClose={closeDetail} />

        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && (setDeleteTarget(null), setReason(""))}>
          {/* 상세 모달 패널이 z-[120]이라 그 위로 올린다. */}
          <AlertDialogContent className="z-[130]">
            <AlertDialogHeader>
              <AlertDialogTitle>연습방을 삭제할까요?</AlertDialogTitle>
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
                    지금 입장 시간대인 방입니다. 참여 중인 회원이 있을 수 있어요.
                  </p>
                )}
                <p className="text-muted-fg">
                  {deleteTarget.participants.length > 0
                    ? `예약 ${deleteTarget.participants.length}건이 함께 삭제되며 되돌릴 수 없습니다. 번호가 등록된 예약자에게 취소 안내 문자가 발송됩니다.`
                    : "되돌릴 수 없습니다."}{" "}
                  작성된 후기와 평점은 그대로 남습니다.
                </p>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="삭제 사유 (선택) — 프렌더와 예약자에게 함께 전달됩니다."
                  className="border-rule focus:border-accent-blue w-full rounded-lg border px-3 py-2 text-sm outline-none"
                />
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
      </div>
    </TooltipProvider>
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
