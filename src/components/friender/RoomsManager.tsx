"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, Loader2, Pencil, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fmtTime, formatDateKo } from "@/lib/availability";
import { kstDateMinToMs } from "@/lib/classtime";
import { ROOM_LEVELS, DEFAULT_ROOM_LEVEL, roomLevelLabelKo } from "@/data/room-levels";
import { createRoom, deleteRoom, setRoomVisibility, updateRoom, type RoomInput } from "@/app/friender/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  is_visible: boolean;
};

// 개설 가능 시간대 06:00~23:30(30분 간격) — EnrollScheduleField와 동일한 그리드.
const START_OPTIONS: number[] = [];
for (let m = 6 * 60; m < 24 * 60; m += 30) START_OPTIONS.push(m);

const DURATIONS = [30, 60, 90, 120];
const MAX_AHEAD_DAYS = 90;

// YYYY-MM-DD (KST) + n일. 서버 validateRoomInput의 범위와 동일.
const kstDateStr = (offsetDays = 0): string => {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString("en-CA");
};

type Fields = { title: string; description: string; level: string; capacity: string; sessionDate: string; startMin: number; durationMin: number };

const emptyForm = (): Fields => ({
  title: "",
  description: "",
  level: DEFAULT_ROOM_LEVEL,
  capacity: "6",
  sessionDate: kstDateStr(1), // 기본 내일
  startMin: 20 * 60,
  durationMin: 60,
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

  // 지난 방 판정 = 종료 시각 경과. 마운트 시 1회 계산(분 단위 정밀도 불필요).
  const now = useMemo(() => Date.now(), []);
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

  const canCreate = hasZoomUrl && !!form.title.trim() && !pending;

  return (
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
                  <div className="mt-4 flex justify-end gap-2">
                    <Button type="button" variant="outline" disabled={pending} onClick={() => setEditingId(null)}>
                      취소
                    </Button>
                    <Button
                      type="button"
                      variant="brand"
                      disabled={pending || !editFields.title.trim()}
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
                  onEdit={() => startEdit(r)}
                  onToggleVisible={() =>
                    run(() => setRoomVisibility(r.id, !r.is_visible), r.is_visible ? "비공개로 전환했습니다." : "공개로 전환했습니다.")
                  }
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
        <label className="flex flex-col gap-1">
          <span className="text-muted-fg-faint text-xs font-semibold">시작 시각</span>
          <select value={fields.startMin} disabled={disabled} onChange={(e) => set({ startMin: Number(e.target.value) })} className={selectClass}>
            {START_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {fmtTime(m)}
              </option>
            ))}
          </select>
        </label>
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
  onEdit,
  onToggleVisible,
  onDelete,
}: {
  room: FrienderRoom;
  pending?: boolean;
  isPast?: boolean;
  onEdit?: () => void;
  onToggleVisible?: () => void;
  onDelete: () => void;
}) {
  const iconBtn = "border-rule text-muted-fg hover:bg-surface shrink-0 rounded-md border p-2 transition-colors disabled:opacity-60";

  return (
    <li className={cn("border-rule flex flex-wrap items-center gap-3 border-b px-4 py-3.5 last:border-b-0 md:px-6", isPast && "opacity-60")}>
      <div className="min-w-0 flex-1">
        <p className="text-ink truncate text-sm font-bold">
          {room.title}
          {!room.is_visible && <span className="bg-rule text-muted-fg ml-2 rounded-full px-2 py-0.5 text-xs font-bold">비공개</span>}
        </p>
        <p className="text-muted-fg mt-0.5 text-xs">
          {formatDateKo(room.session_date)} · {fmtTime(room.start_min)}~{fmtTime(room.start_min + room.duration_min)}
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

      <div className="flex shrink-0 gap-1.5">
        {onToggleVisible && (
          <button
            type="button"
            onClick={onToggleVisible}
            disabled={pending}
            aria-pressed={room.is_visible}
            aria-label={room.is_visible ? "비공개로 전환" : "공개로 전환"}
            className={cn(iconBtn, room.is_visible && "border-cta/40 text-cta")}>
            <Eye aria-hidden className="size-4" />
          </button>
        )}
        {onEdit && (
          <button type="button" onClick={onEdit} disabled={pending} aria-label="수정" className={iconBtn}>
            <Pencil aria-hidden className="size-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          disabled={pending}
          aria-label="삭제"
          className={cn(iconBtn, "border-brand/40 text-brand hover:bg-brand/5")}>
          <Trash2 aria-hidden className="size-4" />
        </button>
      </div>
    </li>
  );
}
