"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
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
const END_OPTIONS: number[] = []; // 390 ~ 1440
for (let m = START_MIN + SLOT_MIN; m <= END_MIN; m += SLOT_MIN) END_OPTIONS.push(m);

const fmtTime = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const slotKey = (day: number, min: number) => `${day}-${min}`;

export default function TeacherAvailabilityFinder({ teachers, onView }: { teachers: CurrentTeacher[]; onView: (t: CurrentTeacher) => void }) {
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set());
  const [startMin, setStartMin] = useState(9 * 60); // 09:00
  const [endMin, setEndMin] = useState(10 * 60); // 10:00

  const toggleDay = (day: number) =>
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });

  const rangeValid = endMin > startMin;
  const inputReady = selectedDays.size > 0 && rangeValid;

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
      <h2 className="text-ink text-lg font-extrabold">수업 가능 시간으로 강사 찾기</h2>
      <p className="text-muted-fg mt-1 text-sm">원하는 요일과 시간대를 선택하면, 해당 시간 전체가 비어 있는 강사를 보여줍니다. (30분 단위)</p>

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
                )}>
                {DAY_LABELS[i]}
              </button>
            );
          })}
        </div>
      </div>

      {/* 시간 범위 */}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-muted-fg-faint text-xs font-semibold">시작</span>
          <select
            value={startMin}
            onChange={(e) => setStartMin(Number(e.target.value))}
            className="border-rule focus:border-accent-blue h-10 rounded-md border bg-white px-3 text-sm outline-none">
            {START_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {fmtTime(m)}
              </option>
            ))}
          </select>
        </label>
        <span className="text-muted-fg-faint pb-2.5 text-sm">~</span>
        <label className="flex flex-col gap-1">
          <span className="text-muted-fg-faint text-xs font-semibold">종료</span>
          <select
            value={endMin}
            onChange={(e) => setEndMin(Number(e.target.value))}
            className="border-rule focus:border-accent-blue h-10 rounded-md border bg-white px-3 text-sm outline-none">
            {END_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {fmtTime(m)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!rangeValid && <p className="text-brand mt-2 text-xs">종료 시각은 시작 시각보다 뒤여야 합니다.</p>}

      {/* 결과 */}
      <div className="mt-5">
        {!inputReady ? (
          <p className="text-muted-fg text-sm">요일과 시간대를 선택하세요.</p>
        ) : matches.length === 0 ? (
          <p className="text-muted-fg text-sm">해당 시간에 가능한 강사가 없습니다.</p>
        ) : (
          <>
            <p className="text-ink mb-2 text-sm font-bold">{matches.length}명 가능</p>
            <ul className="border-rule list-none overflow-hidden rounded-lg border">
              {matches.map((t) => (
                <li key={t.id} className="border-rule flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-ink truncate text-sm font-bold">{t.name || t.email}</p>
                    {t.name && <p className="text-muted-fg truncate text-xs">{t.email}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => onView(t)}
                    className="border-rule text-muted-fg hover:bg-surface shrink-0 rounded-md border px-3 py-1.5 text-xs font-bold transition-colors">
                    정보 보기
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
