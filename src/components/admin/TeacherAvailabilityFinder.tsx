"use client";

import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import CurrentTeacherTable from "@/components/admin/CurrentTeacherTable";
import type { CurrentTeacher } from "@/components/admin/TeacherRequestsManager";

// 표시 순서 월~일 → 저장 day(0=일) 매핑. AvailabilityGrid와 값 일치.
const DISPLAY_DAYS = [1, 2, 3, 4, 5, 6, 0];
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// 그리드와 동일한 06:00~24:00, 30분 단위.
const START_MIN = 6 * 60; // 360 (06:00)
const END_MIN = 24 * 60; // 1440 (24:00)
const SLOT_MIN = 30;

const START_OPTIONS: number[] = []; // 360 ~ 1410
for (let m = START_MIN; m < END_MIN; m += SLOT_MIN) START_OPTIONS.push(m);

// 수업 횟수 — 1회=30분, 1~8회(30분~4시간).
const MAX_COUNT = 8;
const COUNT_OPTIONS: number[] = [];
for (let n = 1; n <= MAX_COUNT; n++) COUNT_OPTIONS.push(n);

const fmtTime = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const slotKey = (day: number, min: number) => `${day}-${min}`;

// 분 → 한국어 길이 표기(30분 / 1시간 / 1시간 30분).
const formatDuration = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
};

export default function TeacherAvailabilityFinder({ teachers, onView }: { teachers: CurrentTeacher[]; onView: (t: CurrentTeacher) => void }) {
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set());
  const [startMin, setStartMin] = useState(9 * 60); // 09:00
  const [count, setCount] = useState(1); // 수업 횟수 (1회=30분)

  const toggleDay = (day: number) =>
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });

  // 종료시각은 시작 + 횟수×30분으로 자동 계산. 종료가 24:00을 넘지 않도록 시작 옵션을 제한.
  const endMin = startMin + count * SLOT_MIN;
  const maxStartMin = END_MIN - count * SLOT_MIN;
  const validStartOptions = START_OPTIONS.filter((m) => m <= maxStartMin);

  // 수업 횟수 변경 시 종료가 24:00을 넘으면 시작을 가능한 마지막 슬롯으로 당김.
  const handleCountChange = (next: number) => {
    setCount(next);
    const nextMaxStart = END_MIN - next * SLOT_MIN;
    if (startMin > nextMaxStart) setStartMin(nextMaxStart);
  };

  // 검색 조건 초기화 — 요일 선택 해제 + 기본 횟수/시작시간 복원.
  const isDefault = selectedDays.size === 0 && count === 1 && startMin === 9 * 60;
  const handleReset = () => {
    setSelectedDays(new Set());
    setCount(1);
    setStartMin(9 * 60);
  };

  const inputReady = selectedDays.size > 0;

  const matches = useMemo(() => {
    if (!inputReady) return [];
    // 선택 범위를 덮는 30분 슬롯들.
    const requiredMins: number[] = [];
    for (let m = startMin; m < endMin; m += SLOT_MIN) requiredMins.push(m);
    const days = Array.from(selectedDays);
    return teachers.filter((t) => {
      const set = new Set(t.slots.map((s) => slotKey(s.day, s.min)));
      // 선택한 모든 요일(AND)에서, 범위 내 모든 슬롯이 존재해야 함.
      return days.every((day) => requiredMins.every((min) => set.has(slotKey(day, min))));
    });
  }, [teachers, selectedDays, startMin, endMin, inputReady]);

  return (
    <div className="border-rule rounded-xl border bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-ink text-lg font-extrabold">수업 가능 시간으로 강사 찾기</h2>
        <button
          type="button"
          onClick={handleReset}
          disabled={isDefault}
          className="border-rule text-muted-fg hover:bg-surface inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-50"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          초기화
        </button>
      </div>
      <p className="text-muted-fg mt-1 text-sm">
        원하는 요일·요일당 수업 횟수·시작 시간을 선택하면, 해당 시간 전체가 비어 있는 강사를 보여줍니다. (1회 = 30분, 종료 시각 자동 계산)
      </p>

      {/* 요일 선택 */}
      <div className="mt-4">
        <p className="text-muted-fg-faint mb-2 text-xs font-semibold">요일 (여러 개 선택 시 모두 가능한 강사만)</p>
        <div className="flex flex-wrap gap-2">
          {DISPLAY_DAYS.map((day, i) => {
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
                )}
              >
                {DAY_LABELS[i]}
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
            className="border-rule focus:border-accent-blue h-10 rounded-md border bg-white px-3 text-sm outline-none"
          >
            {COUNT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}회 ({formatDuration(n * SLOT_MIN)})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-fg-faint text-xs font-semibold">시작</span>
          <select
            value={startMin}
            onChange={(e) => setStartMin(Number(e.target.value))}
            className="border-rule focus:border-accent-blue h-10 rounded-md border bg-white px-3 text-sm outline-none"
          >
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
          <div className="border-rule bg-surface text-ink flex h-10 items-center rounded-md border px-3 text-sm font-medium">{fmtTime(endMin)}</div>
        </div>
      </div>
      <p className="text-muted-fg-faint mt-2 text-xs">
        총 {formatDuration(count * SLOT_MIN)} · {fmtTime(startMin)} ~ {fmtTime(endMin)}
      </p>

      {/* 결과 */}
      <div className="mt-5">
        {!inputReady ? (
          <p className="text-muted-fg text-sm">요일과 시간대를 선택하세요.</p>
        ) : matches.length === 0 ? (
          <p className="text-muted-fg text-sm">해당 시간에 가능한 강사가 없습니다.</p>
        ) : (
          <>
            <p className="text-ink mb-2 text-sm font-bold">{matches.length}명 가능</p>
            <CurrentTeacherTable teachers={matches} onView={onView} className="rounded-lg" />
          </>
        )}
      </div>
    </div>
  );
}
