"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { DAY_LABELS_KO, DISPLAY_DAYS, GRID_END_HOUR, GRID_START_HOUR, LESSON_MIN, SLOT_MIN, fmtTime, type Slot } from "@/lib/availability";

// 관리자 "수업 가능 시간으로 강사 찾기"(TeacherAvailabilityFinder)와 동일한 입력 모델을 학생 수강신청용으로 도입.
// 요일(다중) + 요일당 수업 횟수(1~8회, 1회=30분) + 시작 시각 → 종료 자동 계산. 선택값에서 30분 슬롯 배열을 파생해 onChange로 통지.

const START_MIN = GRID_START_HOUR * 60; // 360 (06:00)
const END_MIN = GRID_END_HOUR * 60; // 1440 (24:00)

const START_OPTIONS: number[] = []; // 360 ~ 1410
for (let m = START_MIN; m < END_MIN; m += SLOT_MIN) START_OPTIONS.push(m);

const MAX_COUNT = 1;
const COUNT_OPTIONS: number[] = [];
for (let n = 1; n <= MAX_COUNT; n++) COUNT_OPTIONS.push(n);

// 분 → 한국어 길이 표기(30분 / 1시간 / 1시간 30분).
const formatDuration = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
};

const DEFAULT_START = 9 * 60; // 09:00

// initialSlots(현재 주간 스케줄)에서 요일·시작시각·횟수를 역산해 초기값으로 사용. 빈/무효면 기존 기본값.
function deriveInitial(slots?: Slot[]): { days: Set<number>; startMin: number; count: number } {
  const valid = (slots ?? []).filter((s) => Number.isInteger(s?.day) && Number.isInteger(s?.min));
  if (valid.length === 0) return { days: new Set<number>(), startMin: DEFAULT_START, count: 1 };
  const days = new Set<number>(valid.map((s) => s.day));
  // 한 요일 내 30분 슬롯 수 = 횟수(균일 모델 가정). 현 UI 상한(MAX_COUNT)으로 clamp.
  const minsByDay = new Map<number, Set<number>>();
  for (const s of valid) {
    const set = minsByDay.get(s.day) ?? new Set<number>();
    set.add(s.min);
    minsByDay.set(s.day, set);
  }
  let count = 1;
  for (const set of Array.from(minsByDay.values())) count = Math.max(count, set.size);
  count = Math.min(Math.max(count, 1), MAX_COUNT);
  // 시작 = 최소 min을 30분 그리드로 스냅 후 범위 clamp(종료 ≤ 24:00).
  const rawStart = Math.min(...valid.map((s) => s.min));
  const snapped = START_MIN + Math.round((rawStart - START_MIN) / SLOT_MIN) * SLOT_MIN;
  const startMin = Math.min(Math.max(snapped, START_MIN), END_MIN - count * SLOT_MIN);
  return { days, startMin, count };
}

export default function EnrollScheduleField({ onChange, initialSlots }: { onChange: (slots: Slot[]) => void; initialSlots?: Slot[] }) {
  // 마운트 1회 역산 — 이후 initialSlots 변경엔 반응하지 않음(초기값 전용).
  const initialRef = useRef<{ days: Set<number>; startMin: number; count: number } | null>(null);
  if (!initialRef.current) initialRef.current = deriveInitial(initialSlots);
  const initial = initialRef.current;

  const [selectedDays, setSelectedDays] = useState<Set<number>>(() => new Set(initial.days));
  const [startMin, setStartMin] = useState(initial.startMin);
  const [count, setCount] = useState(initial.count); // 요일당 수업 횟수 (1회=30분)

  // 종료 = 시작 + 횟수×30분. 종료가 24:00을 넘지 않도록 시작 옵션 제한.
  const endMin = startMin + count * SLOT_MIN;
  // 표시 전용 종료(25분 기준 → :25/:55). 슬롯 점유/매칭은 endMin(30분) 그대로.
  const displayEndMin = startMin + count * LESSON_MIN;
  const maxStartMin = END_MIN - count * SLOT_MIN;
  const validStartOptions = START_OPTIONS.filter((m) => m <= maxStartMin);

  const toggleDay = (day: number) =>
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });

  const handleCountChange = (next: number) => {
    setCount(next);
    const nextMaxStart = END_MIN - next * SLOT_MIN;
    if (startMin > nextMaxStart) setStartMin(nextMaxStart);
  };

  // 초기값(프리필 또는 빈값) 기준 — reset은 초기값으로 복원, 이미 초기값이면 비활성.
  const isDefault =
    selectedDays.size === initial.days.size &&
    Array.from(initial.days).every((d) => selectedDays.has(d)) &&
    count === initial.count &&
    startMin === initial.startMin;
  const handleReset = () => {
    setSelectedDays(new Set(initial.days));
    setCount(initial.count);
    setStartMin(initial.startMin);
  };

  // 선택값 → 30분 슬롯 배열 파생(선택 요일 × 시작~종료 범위 모든 슬롯) 후 부모에 통지.
  useEffect(() => {
    const requiredMins: number[] = [];
    for (let m = startMin; m < endMin; m += SLOT_MIN) requiredMins.push(m);
    const slots: Slot[] = [];
    for (const day of Array.from(selectedDays)) for (const min of requiredMins) slots.push({ day, min });
    onChange(slots);
    // onChange는 부모가 useCallback로 안정화하지 않을 수 있어 입력 상태에만 의존.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDays, startMin, endMin]);

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <p className="text-muted-fg text-sm">원하는 요일과 시작 시간을 선택하세요. (1회당 25분)</p>
        <button
          type="button"
          onClick={handleReset}
          disabled={isDefault}
          className="border-rule text-muted-fg hover:bg-surface inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-50">
          <RotateCcw className="size-3.5" aria-hidden />
          초기화
        </button>
      </div>

      {/* 요일 선택 */}
      <div className="mt-4">
        <p className="text-muted-fg-faint mb-2 text-xs font-semibold">원하는 요일 선택하기</p>
        <div className="flex flex-wrap gap-2">
          {DISPLAY_DAYS.map((day) => {
            const on = selectedDays.has(day);
            return (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                aria-pressed={on}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                  on ? "bg-ink border-ink text-white" : "border-rule text-muted-fg bg-white",
                )}>
                {DAY_LABELS_KO[day]}
              </button>
            );
          })}
        </div>
      </div>

      {/* 수업 횟수 + 시작 시간 → 종료 자동 계산 */}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-muted-fg-faint text-xs font-semibold">요일당 수업 횟수</span>
          <select
            value={count}
            onChange={(e) => handleCountChange(Number(e.target.value))}
            className="border-rule focus:border-accent-blue h-10 rounded-md border bg-white px-3 text-sm outline-none">
            {COUNT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}회 ({formatDuration(n * LESSON_MIN)})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-fg-faint text-xs font-semibold">시작</span>
          <select
            value={startMin}
            onChange={(e) => setStartMin(Number(e.target.value))}
            className="border-rule focus:border-accent-blue h-10 rounded-md border bg-white px-3 text-sm outline-none">
            {validStartOptions.map((m) => (
              <option key={m} value={m}>
                {fmtTime(m)}
              </option>
            ))}
          </select>
        </label>
        <span className="text-muted-fg-faint pb-2.5 text-sm">~</span>
        <div className="flex flex-col gap-1">
          <span className="text-muted-fg-faint text-xs font-semibold">종료 (자동)</span>
          <div className="border-rule bg-surface text-ink flex h-10 items-center rounded-md border px-3 text-sm font-medium">
            {fmtTime(displayEndMin)}
          </div>
        </div>
      </div>
      <p className="text-muted-fg-faint mt-2 text-xs">
        요일당 {formatDuration(count * LESSON_MIN)} · {fmtTime(startMin)} ~ {fmtTime(displayEndMin)}
        {selectedDays.size > 0 && ` · 주 ${selectedDays.size}일`}
      </p>
    </div>
  );
}
