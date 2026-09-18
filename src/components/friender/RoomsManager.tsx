"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronRight, Loader2, Pencil, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { ko as koLocale } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { fmtTime, formatDateKo } from "@/lib/availability";
import { canEnterClass, kstDateMinToMs } from "@/lib/classtime";
import { fmtRoomEnd, roomsOverlap, type RoomSlot } from "@/lib/room-time";
import { addDays, fmtDateKo, fmtDateKoDow, fmtDateShort, fromLocalDate, kstToday, toLocalDate, weekdayOf } from "@/lib/date-kst";
import { weekdaysLabelOf } from "@/lib/room-series";
import { ROOM_TOPIC_MAX } from "@/data/room-series";
import EnterRoomButton from "@/components/friending/EnterRoomButton";
import RoomInfoModal from "@/components/friending/RoomInfoModal";
import RoomSeriesForm, { type ExistingRoomSlot, type RoomSeriesFormValues } from "@/components/friender/RoomSeriesForm";
import RoomSeriesEditModal, { type EditableSeries, type RoomSeriesPatchValues } from "@/components/friender/RoomSeriesEditModal";
import { roomLevelLabelKo } from "@/data/room-levels";
import { createRoomSeries, deleteRoom, deleteRoomSeries, updateRoomSeries, updateRoomSession } from "@/app/friender/room-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

// 프렌더 방 관리 — 연습방은 **주간 스케줄 시리즈** 단위로 개설하고, 목록도 시리즈 카드로 묶어 보여준다
// (샤우팅 PrepManager의 "내 강좌" 구조). 서버 액션 호출·toast·router.refresh()는 여기서만 한다.

export type FrienderRoomSession = {
  id: string;
  session_date: string; // KST YYYY-MM-DD
  start_min: number;
  duration_min: number;
  topic: string | null;
  participants: number; // 자리를 잡고 있는 예약 인원(노쇼 제외, 서버가 service_role로 집계)
  noShows: number; // 시작 + 유예까지 미입장이라 자리가 반환된 예약 수
};

export type FrienderRoomSeries = {
  key: string; // series_id ?? 단발 방의 id
  title: string;
  description: string | null;
  level: string;
  capacity: number;
  sessions: FrienderRoomSession[]; // 날짜 오름차순
};

// 회차 개별 수정 — 시작 시각은 10분 단위, 시·분 분리(개설 폼과 같은 규칙).
const START_STEP = 10;
const START_HOURS: number[] = [];
for (let h = 0; h < 24; h++) START_HOURS.push(h);
const START_MINUTES: number[] = [];
for (let m = 0; m < 60; m += START_STEP) START_MINUTES.push(m);
const DURATIONS: number[] = [];
for (let d = 20; d <= 120; d += 10) DURATIONS.push(d);
const MAX_AHEAD_DAYS = 90;

const pad2 = (n: number): string => String(n).padStart(2, "0");

type SessionFields = {
  sessionDate: string;
  startHour: number | null;
  startMinute: number | null;
  durationMin: number;
  topic: string;
};

const startMinOf = (f: SessionFields): number | null => (f.startHour === null || f.startMinute === null ? null : f.startHour * 60 + f.startMinute);

export default function RoomsManager({ series, hasZoomUrl }: { series: FrienderRoomSeries[]; hasZoomUrl: boolean }) {
  const router = useRouter();
  const [createKey, setCreateKey] = useState(0); // 개설 성공 후 폼을 재마운트해 비운다(PrepManager 방식)
  const [editSeries, setEditSeries] = useState<EditableSeries | null>(null);
  const [deleteSeriesTarget, setDeleteSeriesTarget] = useState<FrienderRoomSeries | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<SessionFields | null>(null);
  const [deleteSessionTarget, setDeleteSessionTarget] = useState<{ id: string; label: string } | null>(null);
  const [infoTarget, setInfoTarget] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const today = useMemo(() => kstToday(), []);
  const maxDate = useMemo(() => addDays(today, MAX_AHEAD_DAYS), [today]);

  // 1분 틱 — 입장 시간창 진입을 감지하고(버튼 자동 노출) 진행/종료 구분도 실시간 갱신한다.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // 겹침 사전 경고용 — 내 회차 전부를 평평하게 편다(개설 폼과 회차 수정이 함께 쓴다).
  const allRooms: ExistingRoomSlot[] = useMemo(
    () =>
      series.flatMap((s) =>
        s.sessions.map((r) => ({ id: r.id, title: s.title, sessionDate: r.session_date, startMin: r.start_min, durationMin: r.duration_min })),
      ),
    [series],
  );

  // 남은 회차가 있는 시리즈를 위로. 같은 그룹 안에서는 첫 회차가 이른 순.
  const sorted = useMemo(() => {
    const endOf = (s: FrienderRoomSeries) => {
      const last = s.sessions[s.sessions.length - 1];
      return last ? kstDateMinToMs(last.session_date, last.start_min + last.duration_min) : 0;
    };
    return [...series].sort((a, b) => {
      const aLive = endOf(a) > now ? 0 : 1;
      const bLive = endOf(b) > now ? 0 : 1;
      if (aLive !== bLive) return aLive - bLive;
      return (a.sessions[0]?.session_date ?? "").localeCompare(b.sessions[0]?.session_date ?? "");
    });
  }, [series, now]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success?: string, after?: () => void) => {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        after?.();
        router.refresh();
        if (success) toast.success(success);
      } else {
        toast.error(res.error ?? "오류가 발생했습니다.");
      }
    });
  };

  const submitCreate = (values: RoomSeriesFormValues) => {
    run(
      () => createRoomSeries(values),
      "연습방을 개설했습니다.",
      () => setCreateKey((k) => k + 1),
    );
  };

  const submitSeriesPatch = (values: RoomSeriesPatchValues) => {
    const target = editSeries;
    if (!target) return;
    run(
      () => updateRoomSeries(target.key, values),
      "연습방 정보를 수정했습니다.",
      () => setEditSeries(null),
    );
  };

  const startEditSession = (r: FrienderRoomSession) => {
    setEditingSessionId(r.id);
    setEditFields({
      sessionDate: r.session_date,
      startHour: Math.floor(r.start_min / 60),
      startMinute: r.start_min % 60,
      durationMin: r.duration_min,
      topic: r.topic ?? "",
    });
  };

  const saveSession = (id: string) => {
    if (!editFields) return;
    const startMin = startMinOf(editFields);
    if (startMin === null) return;
    run(
      () =>
        updateRoomSession(id, {
          sessionDate: editFields.sessionDate,
          startMin,
          durationMin: editFields.durationMin,
          topic: editFields.topic,
        }),
      "회차를 수정했습니다.",
      () => {
        setEditingSessionId(null);
        setEditFields(null);
      },
    );
  };

  const confirmDeleteSession = () => {
    const target = deleteSessionTarget;
    setDeleteSessionTarget(null); // base-nova는 AlertDialogAction이 자동으로 닫지 않는다.
    if (!target) return;
    run(() => deleteRoom(target.id), "회차를 삭제했습니다.");
  };

  const confirmDeleteSeries = () => {
    const target = deleteSeriesTarget;
    setDeleteSeriesTarget(null);
    if (!target) return;
    run(() => deleteRoomSeries(target.key), "연습방을 삭제했습니다.");
  };

  // 회차 수정 시 겹침 사전 경고(자기 자신 제외).
  const editConflict = useMemo(() => {
    if (!editFields || !editingSessionId) return null;
    const startMin = startMinOf(editFields);
    if (startMin === null) return null;
    const slot: RoomSlot = { sessionDate: editFields.sessionDate, startMin, durationMin: editFields.durationMin };
    return allRooms.find((r) => r.id !== editingSessionId && roomsOverlap(slot, r)) ?? null;
  }, [editFields, editingSessionId, allRooms]);

  // 툴팁은 현재 이 화면에서만 쓰여 로컬로 감싼다(다른 화면에도 퍼지면 루트 layout으로 올릴 것).
  return (
    <TooltipProvider>
      <div>
        <h2 className="text-ink text-lg font-extrabold">방 관리</h2>
        <p className="text-muted-fg mt-1 text-sm">
          Zoom으로 진행할 연습방을 개설합니다. 요일과 기간을 고르면 회차가 한 번에 만들어지고, 회원은 회차별로 예약합니다.
        </p>

        {!hasZoomUrl && (
          <div className="border-brand/30 bg-brand/5 text-brand mt-4 rounded-xl border px-4 py-3 text-sm font-semibold">
            Zoom URL이 등록되어 있지 않습니다. 「프로필」 탭에서 Zoom URL을 먼저 등록해 주세요.
          </div>
        )}

        {/* 개설 폼 */}
        <div className="border-rule mt-4 rounded-xl border bg-white p-5">
          <h3 className="text-ink text-sm font-extrabold">새 연습방 개설</h3>
          <RoomSeriesForm key={createKey} pending={pending} existingRooms={allRooms} disabled={!hasZoomUrl} onSubmit={submitCreate} />
        </div>

        {/* 내 연습방 */}
        <h3 className="text-ink mt-8 text-sm font-extrabold">내 연습방 ({series.length})</h3>
        {sorted.length === 0 ? (
          <div className="border-rule mt-2 rounded-xl border bg-white">
            <p className="text-muted-fg px-6 py-10 text-center text-sm">개설한 연습방이 없습니다.</p>
          </div>
        ) : (
          <ul className="mt-2 list-none space-y-3">
            {sorted.map((s) => (
              <SeriesCard
                key={s.key}
                series={s}
                now={now}
                pending={pending}
                today={today}
                maxDate={maxDate}
                editingSessionId={editingSessionId}
                editFields={editFields}
                editConflict={editConflict}
                onEditFields={setEditFields}
                onStartEditSession={startEditSession}
                onCancelEditSession={() => {
                  setEditingSessionId(null);
                  setEditFields(null);
                }}
                onSaveSession={saveSession}
                onDeleteSession={(id, label) => setDeleteSessionTarget({ id, label })}
                onOpenInfo={setInfoTarget}
                onEditSeries={setEditSeries}
                onDeleteSeries={setDeleteSeriesTarget}
              />
            ))}
          </ul>
        )}

        {/* 방 소개글 전문 */}
        <RoomInfoModal description={infoTarget} onClose={() => setInfoTarget(null)} />

        {/* 시리즈 공통값 수정 */}
        <RoomSeriesEditModal series={editSeries} pending={pending} onClose={() => setEditSeries(null)} onSubmit={submitSeriesPatch} />

        {/* 회차 삭제 확인 */}
        <AlertDialog open={deleteSessionTarget !== null} onOpenChange={(open) => !open && setDeleteSessionTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>이 회차를 삭제하시겠습니까?</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteSessionTarget && (
                  <>
                    <span className="text-ink font-semibold">{deleteSessionTarget.label}</span> 회차를 삭제합니다. 되돌릴 수 없습니다.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDeleteSession} variant="brand">
                삭제
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* 시리즈 전체 삭제 확인 */}
        <AlertDialog open={deleteSeriesTarget !== null} onOpenChange={(open) => !open && setDeleteSeriesTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>연습방을 통째로 삭제하시겠습니까?</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteSeriesTarget && (
                  <>
                    <span className="text-ink font-semibold">{deleteSeriesTarget.title}</span>의 {deleteSeriesTarget.sessions.length}개 회차를 모두
                    삭제합니다. 예약한 회원이 있는 회차가 하나라도 있으면 삭제할 수 없습니다.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDeleteSeries} variant="brand">
                전체 삭제
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}

/* ===== 시리즈 카드 ===== */

function SeriesCard({
  series,
  now,
  pending,
  today,
  maxDate,
  editingSessionId,
  editFields,
  editConflict,
  onEditFields,
  onStartEditSession,
  onCancelEditSession,
  onSaveSession,
  onDeleteSession,
  onOpenInfo,
  onEditSeries,
  onDeleteSeries,
}: {
  series: FrienderRoomSeries;
  now: number;
  pending: boolean;
  today: string;
  maxDate: string;
  editingSessionId: string | null;
  editFields: SessionFields | null;
  editConflict: ExistingRoomSlot | null;
  onEditFields: (f: SessionFields) => void;
  onStartEditSession: (r: FrienderRoomSession) => void;
  onCancelEditSession: () => void;
  onSaveSession: (id: string) => void;
  onDeleteSession: (id: string, label: string) => void;
  onOpenInfo: (description: string) => void;
  onEditSeries: (s: EditableSeries) => void;
  onDeleteSeries: (s: FrienderRoomSeries) => void;
}) {
  const sessions = series.sessions;
  const first = sessions[0];
  const last = sessions[sessions.length - 1];
  const description = series.description?.trim() ?? "";

  const endMsOf = (r: FrienderRoomSession) => kstDateMinToMs(r.session_date, r.start_min + r.duration_min);
  const startMsOf = (r: FrienderRoomSession) => kstDateMinToMs(r.session_date, r.start_min);

  const remaining = sessions.filter((r) => endMsOf(r) > now);
  const ended = remaining.length === 0;
  // 지금 들어갈 수 있는 회차 — **카드 머리의 입장 버튼**과 「진행 중」 배지, 회차 목록 자동 펼침이
  // 모두 이 하나를 본다. 회차 행에도 같은 버튼이 있지만 그 목록이 기본 접힘이라, 개설자가
  // 자기 방에 들어갈 길을 못 찾는 일이 있었다(실제 겪음) → 카드 위로 끌어올린다.
  const enterableSession = sessions.find((r) => canEnterClass(now, startMsOf(r), endMsOf(r))) ?? null;
  const live = enterableSession !== null;
  const totalReserved = sessions.reduce((sum, r) => sum + r.participants, 0);
  // 정원 하한 — 아직 시작하지 않은 회차 중 가장 많이 예약된 인원.
  const maxReserved = Math.max(0, ...sessions.filter((r) => startMsOf(r) > now).map((r) => r.participants));

  // 시리즈의 주간 스케줄 = **회차 날짜에서 파생**(컬럼이 없다 — weekdaysLabelOf와 같은 방식). 개설 폼의
  // `form.weekdays`에 대응하며, 회차를 옮길 수 있는 요일의 전부다.
  const weekdaysLabel = weekdaysLabelOf(sessions.map((r) => r.session_date));
  const seriesWeekdays = useMemo(() => Array.from(new Set(sessions.map((r) => weekdayOf(r.session_date)))), [sessions]);

  // 시각이 회차마다 다를 수 있다(회차 개별 수정) — 다르면 대표 시각 대신 "회차별 상이"로 알린다.
  const sameTime = sessions.every((r) => r.start_min === first.start_min && r.duration_min === first.duration_min);
  const timeLabel = sameTime ? `${fmtTime(first.start_min)}~${fmtRoomEnd(first.start_min + first.duration_min)}` : "회차별 상이";

  const badge = ended
    ? { label: "종료", cls: "bg-surface text-muted-fg" }
    : live
      ? { label: "진행 중", cls: "bg-[#eafff1] text-[#22c55e]" }
      : { label: "예정", cls: "bg-cta/10 text-cta" };

  const iconBtn = "border-rule text-muted-fg hover:bg-surface shrink-0 rounded-md border p-2 transition-colors disabled:opacity-60";

  return (
    <li className={cn("border-rule rounded-xl border bg-white p-5", ended && "opacity-70")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", badge.cls)}>{badge.label}</span>
            <h4 className="text-ink truncate text-base font-extrabold">{series.title}</h4>
          </div>
          <p className="text-muted-fg mt-1 text-xs">
            {first ? `${fmtDateKo(first.session_date)} ~ ${fmtDateKo(last.session_date)}` : "-"} · {weekdaysLabel} · {timeLabel}
          </p>
          <p className="text-muted-fg-faint mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            <span className="bg-accent-blue-soft text-accent-blue-ink rounded-full px-2 py-0.5 font-bold">{roomLevelLabelKo(series.level)}</span>
            <span>총 {sessions.length}회차</span>
            <span>남은 {remaining.length}회차</span>
            <span className={cn("inline-flex items-center gap-1", totalReserved > 0 && "text-cta font-bold")}>
              <Users aria-hidden className="size-3" />
              누적 예약 {totalReserved}명 · 정원 {series.capacity}명
            </span>
          </p>
          {/* 소개는 모달로 — 카드마다 문단 길이가 달라 목록이 들쭉날쭉해진다(프렌딩·마이페이지와 같은 규칙). */}
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
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {/* 입장 — 회차 행에도 있지만 그 목록이 접혀 있어, 시간창이 열리면 카드 머리에서 바로 들어가게 한다. */}
          {enterableSession && (
            <EnterRoomButton
              roomId={enterableSession.id}
              label="입장"
              disabled={pending}
              className="bg-cta mr-1 shrink-0 rounded-md px-3 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            />
          )}
          <Tooltip>
            <TooltipTrigger
              type="button"
              disabled={pending || remaining.length === 0}
              aria-label="연습방 정보 수정"
              onClick={() =>
                onEditSeries({
                  key: series.key,
                  title: series.title,
                  description: series.description,
                  level: series.level,
                  capacity: series.capacity,
                  remaining: remaining.length,
                  maxReserved,
                })
              }
              className={cn(iconBtn, remaining.length === 0 && "disabled:pointer-events-auto disabled:cursor-not-allowed")}>
              <Pencil aria-hidden className="size-4" />
            </TooltipTrigger>
            <TooltipContent>{remaining.length === 0 ? "남은 회차가 없어요" : "이름·소개·난이도·정원 수정"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              type="button"
              disabled={pending || totalReserved > 0}
              aria-label="연습방 전체 삭제"
              onClick={() => onDeleteSeries(series)}
              // 비활성 버튼은 기본적으로 hover 이벤트가 죽어 툴팁이 안 뜬다 → pointer-events를 되살린다.
              className={cn(
                iconBtn,
                "border-brand/40 text-brand hover:bg-brand/5",
                totalReserved > 0 && "disabled:pointer-events-auto disabled:cursor-not-allowed",
              )}>
              <Trash2 aria-hidden className="size-4" />
            </TooltipTrigger>
            <TooltipContent>{totalReserved > 0 ? "예약자가 있는 회차가 있어 전체 삭제할 수 없어요" : "전체 삭제"}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* 회차 목록 — 회차가 많아 기본은 접어 두되, **입장 시간창이 열리면 자동으로 펼친다**.
          ⚠️ React는 `open`이 **바뀔 때만** DOM에 쓴다 → 그 사이 사용자가 직접 접은 건 유지되고,
             1분 틱마다 다시 열리지 않는다(시간창 진입/종료 순간에만 열고 닫힌다). */}
      <details open={live} className="group mt-3">
        <summary className="text-accent-blue-ink border-rule hover:bg-surface list-none rounded-lg border px-3 py-2 text-xs font-bold transition-colors">
          회차 {sessions.length}개 보기 · 예약 현황
        </summary>
        <ul className="border-rule mt-2 list-none overflow-hidden rounded-lg border">
          {sessions.map((r, i) =>
            editingSessionId === r.id && editFields ? (
              <li key={r.id} className="border-rule bg-surface border-b p-4 last:border-b-0">
                <SessionFieldsEditor
                  fields={editFields}
                  onChange={onEditFields}
                  today={today}
                  maxDate={maxDate}
                  allowedWeekdays={seriesWeekdays}
                  weekdaysLabel={weekdaysLabel}
                  // 같은 시리즈의 다른 회차 날짜 — 겹쳐 놓으면 저장이 겹침 검사에 걸리므로 애초에 못 고르게 한다.
                  usedDates={sessions.filter((x) => x.id !== r.id).map((x) => x.session_date)}
                  disabled={pending}
                  lockSchedule={r.participants > 0 || r.noShows > 0}
                />
                {editConflict && (
                  <p className="border-brand/30 bg-brand/5 text-brand mt-3 rounded-lg border px-3 py-2 text-xs font-semibold">
                    이미 같은 시간에 개설한 방이 있어요. ({editConflict.title} · {fmtTime(editConflict.startMin)}~
                    {fmtRoomEnd(editConflict.startMin + editConflict.durationMin)})
                  </p>
                )}
                <div className="mt-3 flex justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onCancelEditSession}>
                    취소
                  </Button>
                  <Button
                    type="button"
                    variant="brand"
                    size="sm"
                    disabled={pending || startMinOf(editFields) === null || !!editConflict}
                    onClick={() => onSaveSession(r.id)}>
                    {pending && <Loader2 className="animate-spin" />}
                    저장
                  </Button>
                </div>
              </li>
            ) : (
              <SessionRow
                key={r.id}
                session={r}
                index={i}
                total={sessions.length}
                capacity={series.capacity}
                pending={pending}
                isPast={endMsOf(r) <= now}
                started={startMsOf(r) <= now}
                enterable={canEnterClass(now, startMsOf(r), endMsOf(r))}
                onEdit={() => onStartEditSession(r)}
                onDelete={() => onDeleteSession(r.id, `${i + 1}회차 · ${formatDateKo(r.session_date)}`)}
              />
            ),
          )}
        </ul>
      </details>
    </li>
  );
}

/* ===== 회차 행 ===== */

function SessionRow({
  session,
  index,
  total,
  capacity,
  pending,
  isPast,
  started,
  enterable,
  onEdit,
  onDelete,
}: {
  session: FrienderRoomSession;
  index: number;
  total: number;
  capacity: number;
  pending: boolean;
  isPast: boolean;
  started: boolean;
  enterable: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const iconBtn = "border-rule text-muted-fg hover:bg-surface shrink-0 rounded-md border p-2 transition-colors disabled:opacity-60";
  const hasGuests = session.participants > 0 || session.noShows > 0; // 예약이 들어온 회차는 한눈에 구분되게 강조

  return (
    <li
      className={cn(
        "border-rule flex flex-wrap items-center gap-3 border-b px-4 py-3 last:border-b-0",
        // 좌측 액센트 + 옅은 배경(pl은 테두리 두께만큼 줄여 텍스트 시작선을 맞춘다).
        hasGuests && "border-l-cta bg-cta/[0.04] border-l-4 pl-3",
        isPast && "opacity-60",
      )}>
      <div className="min-w-0 flex-1">
        <p className="text-ink text-sm font-bold">
          <span className="text-muted-fg-faint font-semibold">
            {index + 1}/{total}회차
          </span>{" "}
          · {fmtDateShort(session.session_date)} · {fmtTime(session.start_min)}~{fmtRoomEnd(session.start_min + session.duration_min)}
        </p>
        <p className="text-muted-fg mt-0.5 truncate text-xs">{session.topic?.trim() || "주제 미정"}</p>
        <p className="text-muted-fg-faint mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
          <span className={cn("inline-flex items-center gap-1", session.participants > 0 && "text-cta font-bold")}>
            <Users aria-hidden className="size-3" />
            {session.participants}/{capacity}명
          </span>
          {/* 노쇼 — 시작 후 유예까지 미입장이라 자리를 반환한 예약. 신원은 알 수 없어 수만 보여준다. */}
          {session.noShows > 0 && <span className="bg-rule/60 text-muted-fg rounded-full px-2 py-0.5 font-bold">미입장 {session.noShows}</span>}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {/* 입장 — 시간창(시작 15분 전~종료) 안에서만. */}
        {enterable && (
          <EnterRoomButton
            roomId={session.id}
            label="입장"
            disabled={pending}
            className="bg-cta mr-1 shrink-0 rounded-md px-3 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          />
        )}
        {!started && (
          <Tooltip>
            <TooltipTrigger type="button" onClick={onEdit} disabled={pending} aria-label="회차 수정" className={iconBtn}>
              <Pencil aria-hidden className="size-4" />
            </TooltipTrigger>
            <TooltipContent>회차 수정</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger
            type="button"
            onClick={onDelete}
            disabled={pending || session.participants > 0 || session.noShows > 0}
            aria-label="회차 삭제"
            className={cn(
              iconBtn,
              "border-brand/40 text-brand hover:bg-brand/5",
              hasGuests && "disabled:pointer-events-auto disabled:cursor-not-allowed",
            )}>
            <Trash2 aria-hidden className="size-4" />
          </TooltipTrigger>
          <TooltipContent>{hasGuests ? "예약자가 있어 삭제할 수 없어요" : "회차 삭제"}</TooltipContent>
        </Tooltip>
      </div>
    </li>
  );
}

/* ===== 회차 개별 수정 입력 ===== */

// 날짜 + 시작 분을 분리해 다룬다(datetime-local은 브라우저 로컬 시간이라 KST 스케줄에 부적합).
function SessionFieldsEditor({
  fields,
  onChange,
  today,
  maxDate,
  allowedWeekdays,
  weekdaysLabel,
  usedDates,
  disabled,
  lockSchedule,
}: {
  fields: SessionFields;
  onChange: (f: SessionFields) => void;
  today: string;
  maxDate: string;
  // 시리즈가 쓰는 요일(개설 폼의 form.weekdays에 대응) — 회차는 **같은 요일 안에서만** 옮긴다.
  allowedWeekdays: number[];
  weekdaysLabel: string; // "월·수·금"
  usedDates: string[]; // 같은 시리즈의 다른 회차 날짜
  disabled?: boolean;
  // 예약자가 있는 회차 — 날짜·시각·진행 시간만 잠근다(주제는 계속 수정 가능).
  lockSchedule?: boolean;
}) {
  const [dateOpen, setDateOpen] = useState(false);
  const set = (patch: Partial<SessionFields>) => onChange({ ...fields, ...patch });
  const selectClass = "border-rule focus:border-accent-blue h-10 rounded-md border bg-white px-3 text-sm outline-none disabled:opacity-60";

  // 개설 폼의 isPickable과 같은 규칙(같은 요일 + 오늘~+90일)에 **중복 날짜 제외**를 더한 것.
  const isPickable = (key: string) => key >= today && key <= maxDate && allowedWeekdays.includes(weekdayOf(key)) && !usedDates.includes(key);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {/* ⚠️ <label>로 감싸지 않는다 — 트리거가 버튼이라 라벨 클릭이 팝오버를 한 번 더 토글한다. */}
      <div className="flex flex-col gap-1">
        <span id="session-date-label" className="text-muted-fg-faint text-xs font-semibold">
          수업 날짜
        </span>
        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger
            type="button"
            aria-labelledby="session-date-label"
            disabled={disabled || lockSchedule}
            className={cn(selectClass, "flex items-center justify-between gap-2 text-left")}>
            <span>{fmtDateKoDow(fields.sessionDate)}</span>
            <CalendarDays aria-hidden className="text-muted-fg-faint size-4 shrink-0" />
          </PopoverTrigger>
          {/* 기본 w-72라 달력 폭에 맞춰 덮어쓴다. 달력 옵션은 개설 폼과 동일하게 — 두 화면이 같아 보여야 한다. */}
          <PopoverContent align="start" className="w-auto p-2">
            <Calendar
              mode="single"
              selected={toLocalDate(fields.sessionDate)}
              onSelect={(d) => {
                if (!d) return; // 선택된 날짜를 다시 누르면 undefined — 회차는 날짜가 반드시 있어야 하므로 무시
                set({ sessionDate: fromLocalDate(d) });
                setDateOpen(false);
              }}
              defaultMonth={toLocalDate(fields.sessionDate)}
              startMonth={toLocalDate(today)}
              endMonth={toLocalDate(maxDate)}
              disabled={(d: Date) => !isPickable(fromLocalDate(d))}
              locale={koLocale}
              weekStartsOn={0}
              showOutsideDays={false}
              formatters={{ formatWeekdayName: (d: Date) => d.toLocaleDateString("ko-KR", { weekday: "short" }) }}
              modifiers={{ sunday: { dayOfWeek: [0] }, saturday: { dayOfWeek: [6] } }}
              modifiersClassNames={{ sunday: "!text-brand", saturday: "!text-accent-blue-ink" }}
            />
          </PopoverContent>
        </Popover>
        {!lockSchedule && (
          <p className="text-muted-fg-faint text-xs">{weekdaysLabel}요일 중에서만 옮길 수 있어요. 이미 있는 회차 날짜는 고를 수 없습니다.</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* 시·분 두 컨트롤이라 <label>로 감싸지 않는다 — 각각 aria-label을 준다. */}
        <div className="flex flex-col gap-1">
          <span className="text-muted-fg-faint text-center text-xs font-semibold">시작 시각</span>
          <div className="flex items-center gap-1.5">
            <select
              aria-label="시작 시각 (시)"
              value={fields.startHour ?? ""}
              disabled={disabled || lockSchedule}
              onChange={(e) => set({ startHour: e.target.value === "" ? null : Number(e.target.value) })}
              className={cn(selectClass, "flex-1", fields.startHour === null && "text-muted-fg-faint")}>
              <option value="">시</option>
              {START_HOURS.map((h) => (
                <option key={h} value={h}>
                  {pad2(h)}
                </option>
              ))}
            </select>
            <span aria-hidden className="text-muted-fg text-sm font-bold">
              :
            </span>
            <select
              aria-label="시작 시각 (분)"
              value={fields.startMinute ?? ""}
              disabled={disabled || lockSchedule}
              onChange={(e) => set({ startMinute: e.target.value === "" ? null : Number(e.target.value) })}
              className={cn(selectClass, "flex-1", fields.startMinute === null && "text-muted-fg-faint")}>
              <option value="">분</option>
              {START_MINUTES.map((m) => (
                <option key={m} value={m}>
                  {pad2(m)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-muted-fg-faint text-xs font-semibold">진행 시간</span>
          <select
            value={fields.durationMin}
            disabled={disabled || lockSchedule}
            onChange={(e) => set({ durationMin: Number(e.target.value) })}
            className={selectClass}>
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d}분
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1 sm:col-span-2">
        <span className="text-muted-fg-faint text-xs font-semibold">회차 주제 (선택)</span>
        <Input
          value={fields.topic}
          onChange={(e) => set({ topic: e.target.value })}
          disabled={disabled}
          maxLength={ROOM_TOPIC_MAX}
          placeholder="이 회차에서 나눌 주제"
          className="h-10"
        />
      </label>

      {lockSchedule && (
        <p className="text-muted-fg bg-surface border-rule rounded-lg border px-3 py-2 text-xs font-semibold sm:col-span-2">
          예약한 회원이 있어 일정(날짜·시각·진행 시간)은 변경할 수 없어요. 회차 주제는 수정할 수 있습니다.
        </p>
      )}
    </div>
  );
}
