"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtTime, lessonEndMin, DAY_LABELS_KO, DISPLAY_DAYS, ROW_MINS, SLOT_MIN, GRID_START_HOUR } from "@/lib/availability";
import { kstDateMinToMs } from "@/lib/classtime";

export type AdminSession = {
  enrollmentId: string;
  classId: string; // 개별 회차 id(센터 매니저 인라인 강사 대체 대상)
  teacherId: string; // 현재 담당 강사 id(대체 후보에서 제외)
  sessionNo: number; // 회차 번호(대체 피커 표시용)
  courseTitle: string;
  weekdays: string; // 과정 주간 요일 요약(예: "월/수/금") — 정규 수업 기준.
  teacherName: string | null;
  centerName: string | null; // 강사 현재 소속 센터명(역산, 미지정 강사는 null)
  studentName: string | null;
  studentEnglishName: string | null;
  sessionDate: string; // YYYY-MM-DD (KST)
  startMin: number;
  endMin: number;
  period: string; // 과정 수업 일정(시작일 ~ 종료일)
  totalSessions: number; // 과정 계획 수업 횟수
  isMakeup: boolean;
  conductedAt: string | null;
  conductedOverride: boolean | null;
  teacherReassignedAt: string | null; // 강사 대체 시각(있으면 "대체" 배지)
};

const ROW_H = 48; // 30분 슬롯 셀 높이(px)
const DAY_LABELS_KO_MON = DISPLAY_DAYS.map((d) => DAY_LABELS_KO[d]); // 월~일 순 한국어 요일

const pad = (n: number) => String(n).padStart(2, "0");
const dateToStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (d: Date, n: number) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
};
// 해당 날짜가 속한 주의 월요일(로컬 자정). getDay 0=일 → 6일 전이 월요일.
function mondayOf(d: Date): Date {
  const base = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = base.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  base.setDate(base.getDate() + diff);
  return base;
}

type SlotSel = { date: Date; min: number; list: AdminSession[] };

export default function ClassWeekGrid({
  sessions,
  now,
  readOnly = false,
  onReassign,
}: {
  sessions: AdminSession[];
  now: number;
  readOnly?: boolean;
  onReassign?: (s: AdminSession) => void;
}) {
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date(now)));
  const thisMonday = mondayOf(new Date(now));
  const isThisWeek = weekStart.getTime() === thisMonday.getTime();
  const [slot, setSlot] = useState<SlotSel | null>(null);

  const days = useMemo(() => DISPLAY_DAYS.map((_, i) => addDays(weekStart, i)), [weekStart]); // 월..일

  // 요일 칼럼(0=월..6=일) × 30분 슬롯(rowMin) → 그 슬롯에 겹치는 세션 목록.
  const byDaySlot = useMemo(() => {
    const startMs = weekStart.getTime();
    const endMs = addDays(weekStart, 7).getTime();
    const map = new Map<number, Map<number, AdminSession[]>>();
    for (const s of sessions) {
      const t = parseDate(s.sessionDate).getTime();
      if (t < startMs || t >= endMs) continue;
      const idx = DISPLAY_DAYS.indexOf(parseDate(s.sessionDate).getDay());
      if (idx < 0) continue;
      let byMin = map.get(idx);
      if (!byMin) map.set(idx, (byMin = new Map()));
      for (const min of ROW_MINS) {
        if (s.startMin <= min && min < s.endMin) {
          const arr = byMin.get(min) ?? [];
          arr.push(s);
          byMin.set(min, arr);
        }
      }
    }
    return map;
  }, [sessions, weekStart]);

  const weekLabel = `${weekStart.getMonth() + 1}월 ${weekStart.getDate()}일 – ${addDays(weekStart, 6).getMonth() + 1}월 ${addDays(weekStart, 6).getDate()}일`;

  return (
    <div className="space-y-4">
      {/* 주 네비 */}
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => setWeekStart((w) => addDays(w, -7))}
          aria-label="이전 주"
          className="text-muted-fg hover:text-ink border-rule focus-visible:ring-accent-blue/50 inline-flex size-8 items-center justify-center rounded-md border transition-colors focus-visible:ring-2 focus-visible:outline-none">
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-ink min-w-[11rem] text-center text-sm font-bold">{weekLabel}</span>
        <button
          type="button"
          onClick={() => setWeekStart((w) => addDays(w, 7))}
          aria-label="다음 주"
          className="text-muted-fg hover:text-ink border-rule focus-visible:ring-accent-blue/50 inline-flex size-8 items-center justify-center rounded-md border transition-colors focus-visible:ring-2 focus-visible:outline-none">
          <ChevronRight className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => setWeekStart(mondayOf(new Date(now)))}
          disabled={isThisWeek}
          className="text-accent-blue-ink hover:bg-accent-blue-soft/40 border-accent-blue/40 focus-visible:ring-accent-blue/50 ml-1 inline-flex h-8 items-center rounded-md border px-3 text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40 disabled:hover:bg-transparent">
          이번 주
        </button>
      </div>

      {/* 타임그리드 */}
      <div className="border-rule rounded-xl border bg-white">
        <div className="max-h-[70vh] overflow-auto">
          <div className="min-w-[640px]">
            {/* 요일 헤더 */}
            <div className="border-rule sticky top-0 z-20 flex border-b bg-white">
              <div className="sticky left-0 z-10 w-14 shrink-0 bg-white" />
              {days.map((d, i) => {
                const today = dateToStr(d) === dateToStr(new Date(now));
                const dow = d.getDay();
                const weekendColor = dow === 0 ? "text-brand" : dow === 6 ? "text-accent-blue-ink" : null;
                return (
                  <div key={i} className="flex-1 py-1.5 text-center">
                    <div className={cn("text-xs font-bold", weekendColor ?? (today ? "text-accent-blue-ink" : "text-muted-fg"))}>{DAY_LABELS_KO_MON[i]}</div>
                    <div className={cn("text-[11px]", today && "font-bold", weekendColor ?? (today ? "text-accent-blue-ink" : "text-muted-fg-faint"))}>
                      {d.getMonth() + 1}/{d.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex">
              {/* 시간 거터 */}
              <div className="sticky left-0 z-10 w-14 shrink-0 bg-white">
                {ROW_MINS.map((min) => (
                  <div
                    key={min}
                    className={cn(
                      "border-t pr-1.5 text-right text-[10px]",
                      min % 60 === 0 ? "border-muted-fg-faint text-muted-fg border-t-2 font-semibold" : "border-rule-faint text-muted-fg-faint border-dotted",
                    )}
                    style={{ height: ROW_H }}>
                    {fmtTime(min)}
                  </div>
                ))}
              </div>

              {/* 요일 칼럼 */}
              {days.map((d, i) => {
                const byMin = byDaySlot.get(i);
                const dStr = dateToStr(d);
                return (
                  <div key={i} className="border-rule-faint relative flex-1 border-l first:border-l-0">
                    {ROW_MINS.map((min) => {
                      const list = byMin?.get(min);
                      const count = list?.length ?? 0;
                      // 슬롯 종료(min+30분)가 지났으면 지나간 시간대 — 배경/셀 회색 음영.
                      const past = now >= kstDateMinToMs(dStr, min + SLOT_MIN);
                      // 종료됐는데 미진행(강사 미입장/피드백 없음)인 수업이 하나라도 있으면 붉은색 강조.
                      const hasUnconducted =
                        past && !!list?.some((s) => now >= kstDateMinToMs(s.sessionDate, lessonEndMin(s.endMin)) && !(s.conductedOverride ?? !!s.conductedAt));
                      return (
                        <div
                          key={min}
                          className={cn(
                            "border-t",
                            min % 60 === 0 ? "border-muted-fg-faint border-t-2" : "border-rule-faint border-dotted",
                            past && "bg-surface",
                          )}
                          style={{ height: ROW_H }}>
                          {count > 0 && list && (
                            <button
                              type="button"
                              onClick={() => setSlot({ date: d, min, list })}
                              title={`${fmtTime(min)} · ${count}개 수업`}
                              className={cn(
                                "focus-visible:ring-cta/50 flex size-[calc(100%-4px)] m-0.5 items-center justify-center rounded-md text-xs font-bold transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none",
                                past
                                  ? hasUnconducted
                                    ? "bg-brand/15 text-brand"
                                    : "bg-rule/60 text-muted-fg-faint"
                                  : count >= 3
                                    ? "bg-accent-blue/50 text-white"
                                    : count === 2
                                      ? "bg-accent-blue/30 text-accent-blue-ink"
                                      : "bg-accent-blue-soft text-accent-blue-ink",
                              )}>
                              {count}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {slot && <SlotModal slot={slot} now={now} readOnly={readOnly} onReassign={onReassign} onClose={() => setSlot(null)} />}
    </div>
  );
}

function formatDayLabel(d: Date): string {
  const dow = d.getDay();
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DAY_LABELS_KO[dow]})`;
}

function SlotModal({
  slot,
  now,
  onClose,
  readOnly = false,
  onReassign,
}: {
  slot: SlotSel;
  now: number;
  onClose: () => void;
  readOnly?: boolean;
  onReassign?: (s: AdminSession) => void;
}) {
  const router = useRouter();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const list = useMemo(() => [...slot.list].sort((a, b) => a.startMin - b.startMin), [slot.list]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-[110] bg-black/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed top-1/2 left-1/2 z-[120] flex max-h-[85vh] w-[min(92vw,460px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="border-rule flex items-start justify-between gap-3 border-b px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-ink text-lg font-bold">{formatDayLabel(slot.date)}</h2>
            <p className="text-muted-fg mt-0.5 text-sm">
              {fmtTime(slot.min)} · 수업 {list.length}개
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-muted-fg-faint hover:text-ink focus-visible:ring-accent-blue/50 shrink-0 rounded transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
            <X className="size-5" />
          </button>
        </div>

        <ul className="divide-rule divide-y overflow-y-auto">
          {list.map((s, idx) => {
            const inner = (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-ink text-sm font-bold">{fmtTime(s.startMin)}~{fmtTime(lessonEndMin(s.endMin))}</span>
                  {s.isMakeup && <span className="bg-accent-blue-soft text-accent-blue-ink rounded-full px-2 py-0.5 text-xs font-bold">보강</span>}
                  {s.teacherReassignedAt && <span className="bg-cta/10 text-cta rounded-full px-2 py-0.5 text-xs font-bold">대체</span>}
                  {now >= kstDateMinToMs(s.sessionDate, lessonEndMin(s.endMin)) &&
                    ((s.conductedOverride ?? !!s.conductedAt) ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">진행됨</span>
                    ) : (
                      <span className="bg-brand/10 text-brand rounded-full px-2 py-0.5 text-xs font-bold">미진행</span>
                    ))}
                </div>
                <span className="text-ink truncate text-sm font-semibold">
                  {s.courseTitle}
                  {s.weekdays && <span className="text-muted-fg-faint font-normal"> · {s.weekdays}</span>}
                </span>
                <span className="text-muted-fg truncate text-xs">
                  강사 {s.teacherName ?? "-"} · 학생 {s.studentName ?? "-"}
                  {s.studentEnglishName ? ` (${s.studentEnglishName})` : ""}
                </span>
                <span className="text-muted-fg-faint truncate text-xs">센터 {s.centerName ?? "미지정"}</span>
                <span className="text-muted-fg-faint truncate text-xs">수업 일정 {s.period}</span>
                <span className="text-muted-fg-faint truncate text-xs">수업 횟수 {s.totalSessions}회</span>
              </>
            );
            const canReassign = !!onReassign && now < kstDateMinToMs(s.sessionDate, s.startMin);
            return (
              <li key={idx}>
                {readOnly ? (
                  <div className="flex w-full items-start justify-between gap-3 px-6 py-3.5 text-left">
                    <div className="flex min-w-0 flex-col gap-1">{inner}</div>
                    {canReassign && (
                      <button
                        type="button"
                        onClick={() => {
                          onReassign!(s);
                          onClose();
                        }}
                        className="border-cta text-cta hover:bg-cta/5 shrink-0 self-center rounded-md border px-3 py-1.5 text-xs font-bold transition-colors">
                        강사 대체
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => router.push(`/admin/classes/${s.enrollmentId}`)}
                    className="hover:bg-surface focus-visible:ring-accent-blue/50 flex w-full flex-col gap-1 px-6 py-3.5 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:-outline-offset-2">
                    {inner}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
