"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ko as koLocale } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { fmtTime } from "@/lib/availability";
import { fmtRoomEnd, roomsOverlap, type RoomSlot } from "@/lib/room-time";
import { addDays, fmtDateKo, fmtDateShort, kstToday, monthsSpannedOf, toLocalDate, weekdayOf } from "@/lib/date-kst";
import { buildWeeklySessions, weekdaysLabelOf } from "@/lib/room-series";
import { ROOM_DEFAULT_WEEKS, ROOM_TOPIC_MAX, ROOM_WEEKDAYS, ROOM_WEEK_OPTIONS } from "@/data/room-series";
import { ROOM_LEVELS, DEFAULT_ROOM_LEVEL, roomLevelLabelKo } from "@/data/room-levels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
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

// 연습방 시리즈 개설 폼 — PrepCourseForm(샤우팅)의 구조를 이식하되 결제·심사가 없어 훨씬 짧다.
// 흐름: 시작일 + 요일 + 기간(주)을 고르면 회차가 자동으로 채워지고, 캘린더에서 개별 조정한다.
//
// ⚠️ 주제는 **날짜를 키로** 들고 있는다(Record<date, topic>). 샤우팅은 주제가 '회차 번호'에
//    귀속돼 배열 인덱스로 맞췄지만, 여기서는 topic이 방 행에 직접 붙으므로 날짜가 곧 키다
//    — 요일을 바꿔 회차가 다시 만들어져도 살아남은 날짜의 주제는 그대로 남는다.

// 서버 액션(createRoomSeries)이 받는 모양 그대로.
export type RoomSeriesFormValues = {
  title: string;
  description: string;
  level: string;
  capacity: number;
  startMin: number;
  durationMin: number;
  sessions: { date: string; topic: string }[];
};

// 시작 시각 — 10분 단위, 시·분 분리, **기본값 없음**(실제 약속 시각이라 확인 없이 제출되면 안 된다).
const START_STEP = 10;
const START_HOURS: number[] = [];
for (let h = 0; h < 24; h++) START_HOURS.push(h);
const START_MINUTES: number[] = [];
for (let m = 0; m < 60; m += START_STEP) START_MINUTES.push(m);

const DURATIONS: number[] = [];
for (let d = 20; d <= 120; d += 10) DURATIONS.push(d);
const DEFAULT_DURATION = 40;

const MAX_AHEAD_DAYS = 90; // 서버 room-actions.ts의 ROOM_MAX_AHEAD_DAYS와 같은 값

const pad2 = (n: number): string => String(n).padStart(2, "0");

// ⚠️ react-day-picker가 주는 Date는 로컬 타임존이다 — toISOString()으로 키를 만들면 KST에서 하루 밀린다.
const toKey = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

type Fields = {
  title: string;
  description: string;
  level: string;
  capacity: string;
  startHour: number | null;
  startMinute: number | null;
  durationMin: number;
  startDate: string;
  weekdays: number[]; // JS getDay 기준. 기본 선택 없음
  weeks: number;
};

const startMinOf = (f: Fields): number | null => (f.startHour === null || f.startMinute === null ? null : f.startHour * 60 + f.startMinute);

export type ExistingRoomSlot = RoomSlot & { id: string; title: string };

export default function RoomSeriesForm({
  pending,
  existingRooms,
  disabled,
  onSubmit,
}: {
  pending: boolean;
  // 시간 겹침 사전 경고용 — 본인 방이 이미 prop으로 내려와 있어 추가 쿼리가 필요 없다.
  existingRooms: ExistingRoomSlot[];
  disabled?: boolean;
  onSubmit: (values: RoomSeriesFormValues) => void;
}) {
  const today = useMemo(() => kstToday(), []);
  const maxDate = useMemo(() => addDays(today, MAX_AHEAD_DAYS), [today]);

  const [form, setForm] = useState<Fields>(() => ({
    title: "",
    description: "",
    level: DEFAULT_ROOM_LEVEL,
    capacity: "4",
    startHour: null,
    startMinute: null,
    durationMin: DEFAULT_DURATION,
    startDate: today,
    weekdays: [],
    weeks: ROOM_DEFAULT_WEEKS,
  }));
  const [dates, setDates] = useState<string[]>([]);
  const [topics, setTopics] = useState<Record<string, string>>({});
  const [bulk, setBulk] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const startMin = startMinOf(form);
  const lock = disabled || pending;

  // 자동 생성분 = "기본 일정". ⚠️ **90일 클램프**: 시작일(max=오늘+90) + 8주면 마지막 회차가 선택 창을 넘어
  // '선택됐는데 비활성'인 칸이 생기고, 그대로 내면 서버가 「마지막 회차는 90일 이내」로 반려한다 → 미리 자른다.
  const buildBase = useCallback(
    (startDate: string, weekdays: number[], weeks: number) => buildWeeklySessions(startDate, weekdays, weeks).filter((d) => d <= maxDate),
    [maxDate],
  );

  // 시작일·요일·기간 중 무엇이 바뀌든 회차를 다시 만든다(캘린더 수동 조정은 그 뒤에 덮어쓴다).
  const regen = (next: Fields) => {
    setForm(next);
    setDates(buildBase(next.startDate, next.weekdays, next.weeks));
  };
  const set = (patch: Partial<Fields>) => setForm((f) => ({ ...f, ...patch }));

  const toggleWeekday = (value: number) => {
    const weekdays = form.weekdays.includes(value) ? form.weekdays.filter((d) => d !== value) : [...form.weekdays, value].sort((a, b) => a - b);
    regen({ ...form, weekdays });
  };

  // 기본 일정 — 이제 '허용 집합'이 아니라 **목표 회차 수**와 「되돌리기」의 원본으로만 쓴다.
  const baseDates = useMemo(() => buildBase(form.startDate, form.weekdays, form.weeks), [buildBase, form.startDate, form.weekdays, form.weeks]);

  // 캘린더에서 고를 수 있는 날짜 = **주간 스케줄과 같은 요일** + [시작일, 오늘+90일] 창 안.
  // ⚠️ 운영 기간(weeks) 밖이어도 된다 — "공휴일이라 한 주 미룬다"는 조정이 이 캘린더의 존재 이유다.
  //    대신 **회차 수는 기본과 같아야** 제출된다(요일은 고정, 개수도 고정, 날짜만 치환).
  const isPickable = useCallback(
    (key: string) => key >= form.startDate && key <= maxDate && form.weekdays.includes(weekdayOf(key)),
    [form.startDate, form.weekdays, maxDate],
  );

  const onSelectDates = (next: Date[] | undefined) => {
    // 비활성 날짜는 캘린더가 콜백을 주지 않지만, 같은 술어를 한 번 더 건다(기존 `k >= today` 필터의 자리).
    const keys = (next ?? []).map(toKey).filter(isPickable);
    setDates(Array.from(new Set(keys)).sort());
  };

  const selectedDates = useMemo(() => dates.map(toLocalDate), [dates]);
  // ⚠️ `dates`가 아니라 `baseDates` 기준 — 날짜를 빼서 한 달이 통째로 비어도 그 달이 계속 보여야 다시 넣을 수 있다.
  const monthsSpanned = useMemo(() => monthsSpannedOf(baseDates), [baseDates]);
  const filledTopics = useMemo(() => dates.filter((d) => (topics[d] ?? "").trim()).length, [dates, topics]);

  // 시간 겹침 사전 경고 — 서버 findOverlappingRooms가 authoritative고 여기는 제출 전 안내 레이어다.
  const conflict = useMemo(() => {
    if (startMin === null || dates.length === 0) return null;
    const slots: RoomSlot[] = dates.map((d) => ({ sessionDate: d, startMin, durationMin: form.durationMin }));
    return existingRooms.find((r) => slots.some((slot) => roomsOverlap(slot, r))) ?? null;
  }, [dates, startMin, form.durationMin, existingRooms]);

  // 회차 수는 기본 일정과 **같아야** 한다 — 날짜를 옮기는 건 되고 늘리거나 줄이는 건 안 된다(기간 select의 몫).
  // 초과 자체는 막지 않는다: 「먼저 새 날짜 추가 → 원래 날짜 제거」 순서로 옮기는 사람이 막히면 안 되므로
  // 개수가 어긋나는 동안 제출만 잠근다. (ROOM_MAX_SESSIONS 상한은 target ≤ 8주×7 = 56이라 여기에 포섭된다.)
  const target = baseDates.length;
  const countOk = target > 0 && dates.length === target;
  const canSubmit = !lock && !!form.title.trim() && startMin !== null && countOk && !conflict;

  const applyBulk = () => {
    const lines = bulk
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, dates.length);
    if (lines.length === 0) return;
    setTopics((prev) => {
      const next = { ...prev };
      lines.forEach((line, i) => {
        next[dates[i]] = line.slice(0, ROOM_TOPIC_MAX);
      });
      return next;
    });
    setBulk("");
    toast.success(`${lines.length}개 회차에 주제를 채웠습니다.`);
  };

  const confirmSubmit = () => {
    setConfirmOpen(false); // base-nova는 AlertDialogAction이 자동으로 닫지 않는다.
    if (!canSubmit || startMin === null) return; // 다이얼로그가 열려 있는 동안 상태가 바뀐 경우 방어
    onSubmit({
      title: form.title,
      description: form.description,
      level: form.level,
      capacity: Number(form.capacity),
      startMin,
      durationMin: form.durationMin,
      sessions: dates.map((date) => ({ date, topic: topics[date] ?? "" })),
    });
  };

  const selectClass = "border-rule focus:border-accent-blue h-10 rounded-md border bg-white px-3 text-sm outline-none disabled:opacity-60";

  return (
    <>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-muted-fg-faint text-xs font-semibold">
            연습방 이름 <span className="text-brand">*</span>
          </span>
          <Input
            value={form.title}
            onChange={(e) => set({ title: e.target.value })}
            disabled={lock}
            maxLength={100}
            placeholder="예) 왕초보 프리토킹 연습방"
            className="h-10"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          {/* 시·분 두 컨트롤이라 <label>로 감싸지 않는다(라벨이 첫 select에만 걸림) — 각각 aria-label을 준다. */}
          <div className="flex flex-col gap-1">
            <span className="text-muted-fg-faint text-center text-xs font-semibold">
              시작 시각 <span className="text-brand">*</span>
            </span>
            <div className="flex items-center gap-1.5">
              <select
                aria-label="시작 시각 (시)"
                value={form.startHour ?? ""}
                disabled={lock}
                onChange={(e) => set({ startHour: e.target.value === "" ? null : Number(e.target.value) })}
                className={cn(selectClass, "flex-1", form.startHour === null && "text-muted-fg-faint")}>
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
                value={form.startMinute ?? ""}
                disabled={lock}
                onChange={(e) => set({ startMinute: e.target.value === "" ? null : Number(e.target.value) })}
                className={cn(selectClass, "flex-1", form.startMinute === null && "text-muted-fg-faint")}>
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
            <select value={form.durationMin} disabled={lock} onChange={(e) => set({ durationMin: Number(e.target.value) })} className={selectClass}>
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
          <select value={form.level} disabled={lock} onChange={(e) => set({ level: e.target.value })} className={selectClass}>
            {ROOM_LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.ko}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-muted-fg-faint text-xs font-semibold">제한 인원 (1~100명)</span>
          {/* h-10: shadcn Input 기본 h-8이라 옆 칸 select(selectClass)와 높이가 어긋난다. */}
          <Input
            type="number"
            min={1}
            max={100}
            value={form.capacity}
            disabled={lock}
            onChange={(e) => set({ capacity: e.target.value })}
            className="h-10"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-muted-fg-faint text-xs font-semibold">시작일</span>
          <input
            type="date"
            value={form.startDate}
            min={today}
            max={maxDate}
            disabled={lock}
            onChange={(e) => regen({ ...form, startDate: e.target.value })}
            className={selectClass}
          />
        </label>

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-muted-fg-faint text-xs font-semibold">방 소개 (선택)</span>
          <Textarea
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
            disabled={lock}
            rows={3}
            maxLength={1000}
            placeholder="어떤 방인지 간단히 소개해 주세요."
          />
        </label>
      </div>

      {/* 주간 스케줄 — 요일 + 기간을 고르면 회차가 자동으로 만들어진다. */}
      <div className="border-rule mt-4 rounded-xl border p-3">
        <p className="text-ink text-sm font-bold">
          수업 요일 <span className="text-brand">*</span>
        </p>
        <p className="text-muted-fg-faint mt-0.5 text-xs">매주 같은 요일에 반복해서 열립니다. (예: 월·수·금)</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ROOM_WEEKDAYS.map((w) => {
            const on = form.weekdays.includes(w.value);
            return (
              <button
                key={w.value}
                type="button"
                disabled={lock}
                aria-pressed={on}
                onClick={() => toggleWeekday(w.value)}
                className={cn(
                  "border-rule size-10 rounded-full border text-sm font-bold transition-colors disabled:opacity-60",
                  on ? "bg-cta border-cta text-white" : "text-muted-fg hover:bg-surface bg-white",
                  w.value === 0 && !on && "text-brand",
                  w.value === 6 && !on && "text-accent-blue-ink",
                )}>
                {w.ko}
              </button>
            );
          })}
        </div>

        <label className="mt-3 flex flex-col gap-1 sm:max-w-40">
          <span className="text-muted-fg-faint text-xs font-semibold">운영 기간</span>
          <select value={form.weeks} disabled={lock} onChange={(e) => regen({ ...form, weeks: Number(e.target.value) })} className={selectClass}>
            {ROOM_WEEK_OPTIONS.map((w) => (
              <option key={w} value={w}>
                {w}주
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* 회차 캘린더 — 자동으로 채운 일자를 보여주고, **같은 요일의 다른 날짜로 옮긴다**(개수는 고정).
          ⚠️ 렌더 조건이 `dates`가 아니라 `baseDates`다: 회차를 전부 빼도 캘린더가 남아야 다시 넣을 수 있다. */}
      {target > 0 && (
        <div className="border-rule mt-4 rounded-xl border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-ink text-sm font-bold">수업 일자</p>
            <p className={cn("text-sm font-bold", countOk ? "text-cta" : "text-brand")}>총 {dates.length}회차</p>
          </div>
          <p className="text-muted-fg-faint mt-0.5 text-xs">
            같은 요일 안에서 다른 날짜로 옮길 수 있어요. 총 회차는 기본 {target}회차에 맞춰 주세요. (공휴일 제외 등)
          </p>

          <Calendar
            // ⚠️ `defaultMonth`는 초기값뿐이라 regen 후에도 뷰가 이전 달에 머문다 → 기본 일정이 바뀌면 remount
            //    시켜 첫 회차 달로 돌려놓는다(선택 상태는 `selected`로 제어되므로 잃지 않는다).
            key={`${form.startDate}:${form.weekdays.join("")}:${form.weeks}`}
            mode="multiple"
            selected={selectedDates}
            onSelect={lock ? undefined : onSelectDates}
            defaultMonth={toLocalDate(baseDates[0])}
            // 운영 기간이 아니라 **선택 창 전체**(시작일~오늘+90일)를 오갈 수 있어야 한 주 뒤로 미룰 수 있다.
            startMonth={toLocalDate(form.startDate)}
            endMonth={toLocalDate(maxDate)}
            numberOfMonths={monthsSpanned}
            // 다른 요일·창 밖은 전부 비활성. 과거는 시작일 min=오늘이라 자동으로 걸러진다.
            disabled={(d: Date) => !isPickable(toKey(d))}
            locale={koLocale}
            weekStartsOn={0}
            showOutsideDays={false}
            formatters={{ formatWeekdayName: (d: Date) => d.toLocaleDateString("ko-KR", { weekday: "short" }) }}
            modifiers={{ sunday: { dayOfWeek: [0] }, saturday: { dayOfWeek: [6] } }}
            modifiersClassNames={{ sunday: "!text-brand", saturday: "!text-accent-blue-ink" }}
            className="mt-2"
          />

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted-fg text-xs">
              {dates.length > 0
                ? `${fmtDateKo(dates[0])} ~ ${fmtDateKo(dates[dates.length - 1])} · ${weekdaysLabelOf(dates)}`
                : "회차를 모두 뺐어요. 날짜를 다시 눌러 주세요."}
            </p>
            {/* 개수가 같아도 날짜가 바뀐 상태를 잡아야 한다(둘 다 오름차순이라 문자열 비교로 충분). */}
            {dates.join(",") !== baseDates.join(",") && (
              <Button type="button" variant="outline" size="sm" disabled={lock} onClick={() => setDates(baseDates)}>
                기본 일정으로 되돌리기
              </Button>
            )}
          </div>
          {!countOk && (
            <p className="text-brand mt-2 text-xs font-bold">
              기본 {target}회차보다 {Math.abs(dates.length - target)}개 {dates.length < target ? "적어요" : "많아요"}.{" "}
              {Math.abs(dates.length - target)}개를 {dates.length < target ? "더 고른" : "뺀"} 뒤 개설할 수 있어요.
            </p>
          )}
        </div>
      )}

      {/* 회차별 주제 — 무료 연습방이라 비워 둬도 개설된다(샤우팅은 전부 필수). */}
      {dates.length > 0 && (
        <div className="border-rule mt-4 rounded-xl border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-ink text-sm font-bold">회차별 주제 (선택)</p>
            <p className="text-muted-fg text-sm font-bold">
              {filledTopics}/{dates.length}
            </p>
          </div>

          <div className="bg-surface border-rule mt-2 rounded-lg border p-2">
            <Textarea
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
              disabled={lock}
              rows={3}
              placeholder={"여러 줄을 붙여넣으면 앞 회차부터 순서대로 채워집니다.\n예)\n카페에서 주문하기\n길 묻기"}
            />
            <div className="mt-2 flex justify-end">
              <Button type="button" variant="outline" size="sm" disabled={lock || !bulk.trim()} onClick={applyBulk}>
                일괄 채우기
              </Button>
            </div>
          </div>

          <ul className="mt-3 list-none space-y-2">
            {dates.map((date, i) => (
              <li key={date} className="flex items-center gap-2">
                <span className="text-muted-fg-faint w-24 shrink-0 text-xs font-semibold">
                  {i + 1}회차 · {fmtDateShort(date)}
                </span>
                <Input
                  value={topics[date] ?? ""}
                  onChange={(e) => setTopics((prev) => ({ ...prev, [date]: e.target.value }))}
                  disabled={lock}
                  maxLength={ROOM_TOPIC_MAX}
                  placeholder="이 회차에서 나눌 주제"
                  className="h-9"
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {conflict && (
        <p className="border-brand/30 bg-brand/5 text-brand mt-3 rounded-lg border px-3 py-2 text-xs font-semibold">
          이미 같은 시간에 개설한 방이 있어요. ({conflict.title} · {fmtTime(conflict.startMin)}~{fmtRoomEnd(conflict.startMin + conflict.durationMin)}
          )
        </p>
      )}

      <div className="mt-4 flex justify-end">
        <Button type="button" variant="brand" disabled={!canSubmit} onClick={() => setConfirmOpen(true)}>
          {pending && <Loader2 className="animate-spin" />}연습방 개설하기
        </Button>
      </div>

      {/* 개설 확인 — 회차가 한 번에 여러 개 만들어지므로 값을 눈으로 확인시킨다. */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>이 내용으로 연습방을 개설할까요?</AlertDialogTitle>
            <AlertDialogDescription>개설하면 「프렌딩」에 바로 공개되고 회원이 회차별로 예약할 수 있습니다.</AlertDialogDescription>
          </AlertDialogHeader>

          {/* ⚠️ AlertDialogDescription은 <p>라 dl을 그 안에 넣을 수 없다 — 형제로 배치한다. */}
          <dl className="border-rule mt-1 grid grid-cols-[5rem_1fr] gap-x-3 gap-y-2 border-t pt-4 text-sm">
            {(
              [
                ["이름", form.title.trim()],
                ["기간", dates.length > 0 ? `${fmtDateKo(dates[0])} ~ ${fmtDateKo(dates[dates.length - 1])}` : "-"],
                ["수업 요일", dates.length > 0 ? `${weekdaysLabelOf(dates)} · 총 ${dates.length}회차` : "-"],
                ["시간", `${fmtTime(startMin ?? 0)}~${fmtRoomEnd((startMin ?? 0) + form.durationMin)} (${form.durationMin}분)`],
                ["난이도", roomLevelLabelKo(form.level)],
                ["제한 인원", `${form.capacity}명`],
                ["회차 주제", `${filledTopics}/${dates.length} 작성`],
                ["방 소개", form.description.trim() || "없음"],
              ] as const
            ).map(([label, value]) => (
              <Fragment key={label}>
                <dt className="text-muted-fg-faint">{label}</dt>
                <dd className="text-ink line-clamp-2 font-semibold break-words">{value}</dd>
              </Fragment>
            ))}
          </dl>

          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSubmit} variant="brand">
              개설하기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
