"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fmtTime, formatDateKo } from "@/lib/availability";
import { canEnterClass, kstDateMinToMs } from "@/lib/classtime";
import { roomsOverlap } from "@/lib/room-time";
import EnterRoomButton from "@/components/friending/EnterRoomButton";
import { ROOM_LEVELS, DEFAULT_ROOM_LEVEL, roomLevelLabelKo } from "@/data/room-levels";
import { createRoom, deleteRoom, updateRoom, type RoomInput } from "@/app/friender/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

export type FrienderRoom = {
  id: string;
  title: string;
  description: string | null;
  level: string;
  capacity: number;
  session_date: string; // KST YYYY-MM-DD
  start_min: number;
  duration_min: number;
};

// 개설 가능 시간대 00:00~23:50(10분 간격, 24시간). 시·분을 각각 고르게 나눠 둔 이유는
// 10분 단위면 단일 드롭다운이 144개가 돼 스크롤 부담이 크기 때문(24개 + 6개로 분할).
// 강사 그리드(EnrollScheduleField, 06:00~)의 하한을 따르지 않는다 — 연습방은 해외 회원과의
// 시차 대응이 필요해 새벽 시간대가 열려 있어야 한다. 서버·DB도 이미 0~1439를 허용한다.
const START_STEP = 10;
const START_HOURS: number[] = [];
for (let h = 0; h < 24; h++) START_HOURS.push(h);
const START_MINUTES: number[] = [];
for (let m = 0; m < 60; m += START_STEP) START_MINUTES.push(m);
const LAST_START_MIN = 24 * 60 - START_STEP; // 23:50

// 진행 시간 20분~2시간, 10분 단위(서버 ROOM_DURATIONS·DB check와 동일 범위).
const DURATIONS: number[] = [];
for (let d = 20; d <= 120; d += 10) DURATIONS.push(d);

const MAX_AHEAD_DAYS = 90;

// YYYY-MM-DD (KST) + n일. 서버 validateRoomInput의 범위와 동일.
// 종료 시각 표시 전용 — 자정을 넘기면 24h로 되감고 '(익일)'을 덧붙인다.
// 저장 값·경과 판정(kstDateMinToMs)은 1440 초과를 정상 처리하므로 표시만 손본다.
// fmtTime 자체는 강의실·정산 등 소비처가 많아 건드리지 않는다.
const pad2 = (n: number): string => String(n).padStart(2, "0");

const fmtEnd = (endMin: number): string => (endMin >= 24 * 60 ? `${fmtTime(endMin - 24 * 60)} (익일)` : fmtTime(endMin));

const kstDateStr = (offsetDays = 0): string => {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString("en-CA");
};

// 지금(KST) 기준 다음 10분 슬롯. 서버가 '시작 시각이 미래'인지 검증하므로 기본값이 과거면 안 된다.
// 오늘 남은 슬롯이 없으면(23:50 지남) 내일 00:00으로 넘긴다.
const nextOpenSlot = (): { sessionDate: string; startMin: number } => {
  const kstNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  // +1분: 정각에 열면 '지금'이 아니라 그 다음 슬롯을 고르도록(서버는 now 초과만 허용).
  const next = Math.ceil((kstNow.getHours() * 60 + kstNow.getMinutes() + 1) / START_STEP) * START_STEP;

  if (next > LAST_START_MIN) return { sessionDate: kstDateStr(1), startMin: 0 };
  return { sessionDate: kstDateStr(), startMin: next };
};

type Fields = { title: string; description: string; level: string; capacity: string; sessionDate: string; startMin: number; durationMin: number };

const emptyForm = (): Fields => ({
  title: "",
  description: "",
  level: DEFAULT_ROOM_LEVEL,
  capacity: "4",
  ...nextOpenSlot(), // 개설 날짜·시작 시각 = 지금 기준 가장 빠른 슬롯
  durationMin: 40,
});

const toInput = (f: Fields): RoomInput => ({
  title: f.title,
  description: f.description,
  level: f.level,
  capacity: Number(f.capacity),
  sessionDate: f.sessionDate,
  startMin: f.startMin,
  durationMin: f.durationMin,
});

export default function RoomsManager({ rooms, hasZoomUrl }: { rooms: FrienderRoom[]; hasZoomUrl: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState<Fields>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<Fields>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<FrienderRoom | null>(null);
  const [pending, startTransition] = useTransition();

  const minDate = useMemo(() => kstDateStr(0), []);
  const maxDate = useMemo(() => kstDateStr(MAX_AHEAD_DAYS), []);

  // 1분 틱 — 입장 시간창 진입을 감지하고(버튼 자동 노출) 예정/지난 분리도 실시간 갱신한다.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const { upcoming, past } = useMemo(() => {
    const up: FrienderRoom[] = [];
    const pa: FrienderRoom[] = [];
    for (const r of rooms) {
      (kstDateMinToMs(r.session_date, r.start_min + r.duration_min) > now ? up : pa).push(r);
    }
    // 예정은 가까운 순, 지난 방은 최근 순(서버가 내림차순으로 주므로 예정만 뒤집는다).
    return { upcoming: up.reverse(), past: pa };
  }, [rooms, now]);

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

  const startEdit = (r: FrienderRoom) => {
    setEditingId(r.id);
    setEditFields({
      title: r.title,
      description: r.description ?? "",
      level: r.level,
      capacity: String(r.capacity),
      sessionDate: r.session_date,
      startMin: r.start_min,
      durationMin: r.duration_min,
    });
  };

  const confirmDelete = () => {
    const target = deleteTarget;
    setDeleteTarget(null); // base-nova는 AlertDialogAction이 자동으로 닫지 않는다.
    if (!target) return;
    run(() => deleteRoom(target.id), "방을 삭제했습니다.");
  };

  // 시간 겹침 사전 경고 — 본인 방이 rooms prop에 전부 있어 추가 쿼리 없이 판정된다.
  // 서버 findOverlappingRoom이 authoritative고 여기는 제출 전에 알려주는 UX 레이어일 뿐
  // (<input min> ↔ validateRoomInput 관계와 동일).
  const conflictOf = (f: Fields, excludeId?: string): FrienderRoom | undefined => {
    const slot = { sessionDate: f.sessionDate, startMin: f.startMin, durationMin: f.durationMin };
    return rooms.find(
      (r) => r.id !== excludeId && roomsOverlap(slot, { sessionDate: r.session_date, startMin: r.start_min, durationMin: r.duration_min }),
    );
  };

  const createConflict = useMemo(() => conflictOf(form), [form, rooms]);
  const editConflict = useMemo(() => (editingId ? conflictOf(editFields, editingId) : undefined), [editFields, editingId, rooms]);

  const canCreate = hasZoomUrl && !!form.title.trim() && !pending && !createConflict;

  // 툴팁은 현재 이 화면에서만 쓰여 로컬로 감싼다(다른 화면에도 퍼지면 루트 layout으로 올릴 것).
  return (
    <TooltipProvider>
      <div>
        <h2 className="text-ink text-lg font-extrabold">방 관리</h2>
        <p className="text-muted-fg mt-1 text-sm">Zoom으로 진행할 연습방을 개설합니다. 회원이 방을 클릭하면 내 Zoom 주소로 연결됩니다.</p>

        {!hasZoomUrl && (
          <div className="border-brand/30 bg-brand/5 text-brand mt-4 rounded-xl border px-4 py-3 text-sm font-semibold">
            Zoom URL이 등록되어 있지 않습니다. 「프로필」 탭에서 Zoom URL을 먼저 등록해 주세요.
          </div>
        )}

        {/* 개설 폼 */}
        <div className="border-rule mt-4 rounded-xl border bg-white p-5">
          <h3 className="text-ink text-sm font-extrabold">새 방 개설</h3>
          <RoomFields fields={form} onChange={setForm} minDate={minDate} maxDate={maxDate} disabled={!hasZoomUrl || pending} />
          {createConflict && <ConflictNotice room={createConflict} />}
          <div className="mt-4 flex justify-end">
            <Button
              type="button"
              variant="brand"
              disabled={!canCreate}
              onClick={() =>
                run(
                  () => createRoom(toInput(form)),
                  "방을 개설했습니다.",
                  () => setForm(emptyForm()),
                )
              }>
              {pending && <Loader2 className="animate-spin" />}방 개설하기
            </Button>
          </div>
        </div>

        {/* 예정된 방 */}
        <h3 className="text-ink mt-8 text-sm font-extrabold">예정된 방 ({upcoming.length})</h3>
        <div className="border-rule mt-2 overflow-hidden rounded-xl border bg-white">
          {upcoming.length === 0 ? (
            <p className="text-muted-fg px-6 py-10 text-center text-sm">예정된 방이 없습니다.</p>
          ) : (
            <ul className="list-none">
              {upcoming.map((r) =>
                editingId === r.id ? (
                  <li key={r.id} className="border-rule bg-surface border-b p-5 last:border-b-0">
                    <RoomFields fields={editFields} onChange={setEditFields} minDate={minDate} maxDate={maxDate} disabled={pending} />
                    {editConflict && <ConflictNotice room={editConflict} />}
                    <div className="mt-4 flex justify-end gap-2">
                      <Button type="button" variant="outline" disabled={pending} onClick={() => setEditingId(null)}>
                        취소
                      </Button>
                      <Button
                        type="button"
                        variant="brand"
                        disabled={pending || !editFields.title.trim() || !!editConflict}
                        onClick={() =>
                          run(
                            () => updateRoom(r.id, toInput(editFields)),
                            "방을 수정했습니다.",
                            () => setEditingId(null),
                          )
                        }>
                        {pending && <Loader2 className="animate-spin" />}
                        저장
                      </Button>
                    </div>
                  </li>
                ) : (
                  <RoomRow
                    key={r.id}
                    room={r}
                    pending={pending}
                    enterable={canEnterClass(
                      now,
                      kstDateMinToMs(r.session_date, r.start_min),
                      kstDateMinToMs(r.session_date, r.start_min + r.duration_min),
                    )}
                    onEdit={() => startEdit(r)}
                    onDelete={() => setDeleteTarget(r)}
                  />
                ),
              )}
            </ul>
          )}
        </div>

        {/* 지난 방 */}
        {past.length > 0 && (
          <>
            <h3 className="text-ink mt-8 text-sm font-extrabold">지난 방 ({past.length})</h3>
            <div className="border-rule mt-2 overflow-hidden rounded-xl border bg-white">
              <ul className="list-none">
                {past.map((r) => (
                  <RoomRow key={r.id} room={r} pending={pending} isPast onDelete={() => setDeleteTarget(r)} />
                ))}
              </ul>
            </div>
          </>
        )}

        {/* 삭제 확인 */}
        <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>방을 삭제하시겠습니까?</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget && (
                  <>
                    <span className="text-ink font-semibold">{deleteTarget.title}</span> 방을 삭제합니다. 되돌릴 수 없습니다.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} variant="brand">
                삭제
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}

// 시간 겹침 안내 — Zoom URL 미등록 배너와 같은 톤.
function ConflictNotice({ room }: { room: FrienderRoom }) {
  return (
    <p className="border-brand/30 bg-brand/5 text-brand mt-3 rounded-lg border px-3 py-2 text-xs font-semibold">
      이미 같은 시간에 개설한 방이 있어요. ({room.title} · {fmtTime(room.start_min)}~{fmtEnd(room.start_min + room.duration_min)})
    </p>
  );
}

// 개설/수정 공용 입력 묶음. 날짜+시작 분을 분리 저장(datetime-local은 브라우저 로컬 시간이라 KST 스케줄에 부적합).
function RoomFields({
  fields,
  onChange,
  minDate,
  maxDate,
  disabled,
}: {
  fields: Fields;
  onChange: (f: Fields) => void;
  minDate: string;
  maxDate: string;
  disabled?: boolean;
}) {
  const set = (patch: Partial<Fields>) => onChange({ ...fields, ...patch });
  const selectClass = "border-rule focus:border-accent-blue h-10 rounded-md border bg-white px-3 text-sm outline-none disabled:opacity-60";

  return (
    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 sm:col-span-2">
        <span className="text-muted-fg-faint text-xs font-semibold">
          오늘의 주제 <span className="text-brand">*</span>
        </span>
        <Input
          value={fields.title}
          onChange={(e) => set({ title: e.target.value })}
          disabled={disabled}
          maxLength={100}
          placeholder="예) 카페에서 주문하기"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-muted-fg-faint text-xs font-semibold">개설 날짜</span>
        <input
          type="date"
          value={fields.sessionDate}
          min={minDate}
          max={maxDate}
          disabled={disabled}
          onChange={(e) => set({ sessionDate: e.target.value })}
          className={selectClass}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        {/* 시·분 두 컨트롤이라 <label>로 감싸지 않는다(라벨이 첫 select에만 걸림) — 각각 aria-label을 준다. */}
        <div className="flex flex-col gap-1">
          {/* 시·분 두 칸에 걸친 제목이라 가운데 정렬(다른 단일 필드 라벨은 좌측 정렬 유지). */}
          <span className="text-muted-fg-faint text-center text-xs font-semibold">시작 시각</span>
          <div className="flex gap-2">
            <select
              aria-label="시작 시각 (시)"
              value={Math.floor(fields.startMin / 60)}
              disabled={disabled}
              onChange={(e) => set({ startMin: Number(e.target.value) * 60 + (fields.startMin % 60) })}
              className={cn(selectClass, "flex-1")}>
              {START_HOURS.map((h) => (
                <option key={h} value={h}>
                  {pad2(h)}시
                </option>
              ))}
            </select>
            <select
              aria-label="시작 시각 (분)"
              value={fields.startMin % 60}
              disabled={disabled}
              onChange={(e) => set({ startMin: Math.floor(fields.startMin / 60) * 60 + Number(e.target.value) })}
              className={cn(selectClass, "flex-1")}>
              {START_MINUTES.map((m) => (
                <option key={m} value={m}>
                  {pad2(m)}분
                </option>
              ))}
            </select>
          </div>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-muted-fg-faint text-xs font-semibold">진행 시간</span>
          <select
            value={fields.durationMin}
            disabled={disabled}
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

      <label className="flex flex-col gap-1">
        <span className="text-muted-fg-faint text-xs font-semibold">난이도</span>
        <select value={fields.level} disabled={disabled} onChange={(e) => set({ level: e.target.value })} className={selectClass}>
          {ROOM_LEVELS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.ko}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-muted-fg-faint text-xs font-semibold">제한 인원 (2~100명)</span>
        <Input type="number" min={2} max={100} value={fields.capacity} disabled={disabled} onChange={(e) => set({ capacity: e.target.value })} />
      </label>

      <label className="flex flex-col gap-1 sm:col-span-2">
        <span className="text-muted-fg-faint text-xs font-semibold">방 소개 (선택)</span>
        <Textarea
          value={fields.description}
          onChange={(e) => set({ description: e.target.value })}
          disabled={disabled}
          rows={3}
          maxLength={1000}
          placeholder="어떤 방인지 간단히 소개해 주세요."
        />
      </label>
    </div>
  );
}

function RoomRow({
  room,
  pending,
  isPast,
  enterable,
  onEdit,
  onDelete,
}: {
  room: FrienderRoom;
  pending?: boolean;
  isPast?: boolean;
  enterable?: boolean;
  onEdit?: () => void;
  onDelete: () => void;
}) {
  const iconBtn = "border-rule text-muted-fg hover:bg-surface shrink-0 rounded-md border p-2 transition-colors disabled:opacity-60";

  return (
    <li className={cn("border-rule flex flex-wrap items-center gap-3 border-b px-4 py-3.5 last:border-b-0 md:px-6", isPast && "opacity-60")}>
      <div className="min-w-0 flex-1">
        <p className="text-ink truncate text-sm font-bold">{room.title}</p>
        <p className="text-muted-fg mt-0.5 text-xs">
          {formatDateKo(room.session_date)} · {fmtTime(room.start_min)}~{fmtEnd(room.start_min + room.duration_min)}
        </p>
        <p className="text-muted-fg-faint mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          <span className="bg-accent-blue-soft text-accent-blue-ink rounded-full px-2 py-0.5 font-bold">{roomLevelLabelKo(room.level)}</span>
          <span className="inline-flex items-center gap-1">
            <Users aria-hidden className="size-3" />
            정원 {room.capacity}명
          </span>
        </p>
        {room.description && <p className="text-muted-fg mt-1 line-clamp-2 text-xs whitespace-pre-wrap">{room.description}</p>}
      </div>

      {/* 아이콘만으로는 기능을 알기 어려워 툴팁을 붙인다. TooltipTrigger는 기본이 <button>이라
          type/onClick/disabled/aria-*가 그대로 전달된다(별도 래핑 불필요). */}
      <div className="flex shrink-0 items-center gap-1.5">
        {/* 입장 — 시간창(시작 15분 전~종료) 안에서만. */}
        {enterable && (
          <EnterRoomButton
            roomId={room.id}
            label="입장"
            disabled={pending}
            className="bg-cta mr-1 shrink-0 rounded-md px-3 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          />
        )}
        {onEdit && (
          <Tooltip>
            <TooltipTrigger type="button" onClick={onEdit} disabled={pending} aria-label="수정" className={iconBtn}>
              <Pencil aria-hidden className="size-4" />
            </TooltipTrigger>
            <TooltipContent>수정</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger
            type="button"
            onClick={onDelete}
            disabled={pending}
            aria-label="삭제"
            className={cn(iconBtn, "border-brand/40 text-brand hover:bg-brand/5")}>
            <Trash2 aria-hidden className="size-4" />
          </TooltipTrigger>
          <TooltipContent>삭제</TooltipContent>
        </Tooltip>
      </div>
    </li>
  );
}
