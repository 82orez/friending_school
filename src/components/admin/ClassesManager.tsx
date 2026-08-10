"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, CalendarRange, Eye, Loader2, Search, UserCog, X } from "lucide-react";
import { ko as koLocale } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { adminCancelClass, adminReassignClass, adminRescheduleRemaining, adminReassignRemaining, adminSetClassConducted } from "@/app/admin/actions";
import { Calendar } from "@/components/ui/calendar";
import { fmtTime, formatDateKo, lessonEndMin, summarizeSlots, teacherHasAllSlots, type Slot } from "@/lib/availability";
import type { EnrollTeacherCard } from "@/app/courses/enroll-actions";
import EnrollScheduleField from "@/components/course/EnrollScheduleField";
import { kstDateMinToMs, ENTRY_LEAD_MS, MAX_CANCELLATIONS } from "@/lib/classtime";
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

export type AdminClass = {
  id: string;
  enrollment_id: string;
  student_id: string;
  teacher_id: string;
  course: string;
  course_title: string;
  teacher_name: string | null;
  student_name: string | null;
  student_english_name: string | null;
  session_no: number;
  session_date: string;
  start_min: number;
  end_min: number;
  status: "예정" | "취소";
  is_makeup: boolean;
  cancel_reason: string | null;
  feedback: string | null;
  feedback_at: string | null;
  teacher_entered_at: string | null;
  conducted_at: string | null;
  conducted_override: boolean | null;
  teacher_reassigned_at: string | null;
};

type DisplayStatus = "예정" | "진행중" | "완료" | "취소";
type View = "list" | "calendar";

// 표시 상태 — DB status(예정/취소)에 시간 기반 '진행중'(입장 가능 시점=시작 15분 전~레슨 종료)·'완료'(레슨 종료 후)를 더해 파생.
function displayStatus(r: AdminClass, now: number): DisplayStatus {
  if (r.status === "취소") return "취소";
  if (now >= kstDateMinToMs(r.session_date, lessonEndMin(r.end_min))) return "완료";
  if (now >= kstDateMinToMs(r.session_date, r.start_min) - ENTRY_LEAD_MS) return "진행중";
  return "예정";
}

const STATUS_BADGE: Record<DisplayStatus, string> = {
  예정: "bg-accent-blue-soft text-accent-blue-ink",
  진행중: "bg-cta text-white animate-pulse",
  완료: "bg-rule text-muted-fg",
  취소: "bg-brand/10 text-brand",
};

// 유효 진행여부 — admin 수동 보정(conducted_override)이 자동 판정(conducted_at)을 덮는다.
function effectiveConducted(r: AdminClass): boolean {
  return r.conducted_override ?? !!r.conducted_at;
}

// 진행 여부 표시 — 진행됨(인정)/미진행(종료됐는데 미인정)/− (예정·취소). override 걸린 행은 "(수동)" 표기.
function conductInfo(r: AdminClass, now: number): { label: string; cls: string } {
  const manual = r.conducted_override !== null ? " (수동)" : "";
  if (effectiveConducted(r)) return { label: `진행됨${manual}`, cls: "bg-cta/10 text-cta" };
  if (r.conducted_override === false || displayStatus(r, now) === "완료") return { label: `미진행${manual}`, cls: "bg-brand/10 text-brand" };
  return { label: "−", cls: "text-muted-fg-faint" };
}

// 미진행(완료됐으나 미인정) 사유 — conducted 규칙: 강사 입장 AND 비어있지 않은 피드백.
function unconductedReason(r: AdminClass): string | null {
  if (!r.teacher_entered_at) return "강사가 입장하지 않았습니다.";
  if (!r.feedback) return "강사는 입장했으나 피드백을 작성하지 않았습니다.";
  return null; // 입장+피드백이 모두 있으면 정상적으론 진행됨 상태(방어적 fallback)
}

const FILTERS: { key: "전체" | DisplayStatus; label: string }[] = [
  { key: "전체", label: "전체" },
  { key: "예정", label: "예정" },
  { key: "진행중", label: "진행중" },
  { key: "완료", label: "완료" },
  { key: "취소", label: "취소" },
];

type SortKey = "date" | "teacher" | "session";

const SORT_VALUE: Record<SortKey, (r: AdminClass) => string> = {
  date: (r) => r.session_date,
  teacher: (r) => r.teacher_name ?? "",
  session: (r) => String(r.session_no).padStart(3, "0"),
};

// 표시 전용 — 종료는 레슨 종료(lessonEndMin=end−5, :25/:55)로 내 강의실 등과 통일. 슬롯 점유/편집 값은 30분(end) 그대로.
function timeRange(start: number, end: number): string {
  return `${fmtTime(start)}~${fmtTime(lessonEndMin(end))}`;
}

export default function ClassesManager({
  classes,
  teachers = [],
  enrollmentId,
  currentSlots = [],
  teacherSlots = [],
  title = "화상수업 관리",
  subtitle = "결제 확정 시 생성된 전체 수업입니다. 예정 수업은 강제 취소(보강 옵션)·강사 대체할 수 있습니다.",
  backHref,
}: {
  classes: AdminClass[];
  teachers?: EnrollTeacherCard[];
  enrollmentId?: string;
  currentSlots?: Slot[];
  teacherSlots?: Slot[];
  title?: string;
  subtitle?: string;
  backHref?: string;
}) {
  const [rows, setRows] = useState(classes);
  const [view, setView] = useState<View>("calendar");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"전체" | DisplayStatus>("전체");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [feedbackTarget, setFeedbackTarget] = useState<AdminClass | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkReassignOpen, setBulkReassignOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // 서버 재검증(router.refresh) 후 새 classes prop을 로컬 상태에 동기화(일괄 변경 반영).
  useEffect(() => setRows(classes), [classes]);

  // 완료 판정(시간 기반) 갱신용 1분 틱.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const toggleSort = (key: SortKey) =>
    setSort((prev) => (prev?.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const counts = useMemo(() => {
    const c: Record<string, number> = { 전체: rows.length, 예정: 0, 진행중: 0, 완료: 0, 취소: 0 };
    for (const r of rows) {
      const s = displayStatus(r, now);
      c[s] = (c[s] ?? 0) + 1;
    }
    return c;
  }, [rows, now]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = rows.filter((r) => {
      if (filter !== "전체" && displayStatus(r, now) !== filter) return false;
      if (!q) return true;
      return `${r.student_name ?? ""} ${r.student_english_name ?? ""} ${r.teacher_name ?? ""} ${r.course_title}`.toLowerCase().includes(q);
    });
    if (!sort) return base;
    const val = (r: AdminClass) => SORT_VALUE[sort.key](r).trim();
    return [...base].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      const cmp = av.localeCompare(bv, "ko");
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [rows, query, filter, sort, now]);

  const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId]);

  // 남은(미래 '예정') 수업 수 — 레슨 종료 시각 기준. 0이면 과정 종료. 단일 enrollment로 스코프된 rows 전체가 한 과정.
  const remainingCount = useMemo(
    () => rows.filter((r) => r.status === "예정" && now < kstDateMinToMs(r.session_date, lessonEndMin(r.end_min))).length,
    [rows, now],
  );
  const courseEnded = rows.length > 0 && remainingCount === 0;
  const canBulkReschedule = !!enrollmentId && remainingCount > 0;

  // 남은 수업 전체 강사 대체용 — 남은 예정 클래스의 실제 요일·시각 union + 현재 담당 강사(단일 enrollment라 동일).
  const bulkReassign = useMemo(() => {
    const rem = rows.filter((r) => r.status === "예정" && now < kstDateMinToMs(r.session_date, lessonEndMin(r.end_min)));
    const seen = new Set<string>();
    const union: Slot[] = [];
    for (const c of rem) {
      const [y, m, d] = c.session_date.split("-").map(Number);
      const day = new Date(y, m - 1, d).getDay();
      for (let min = c.start_min; min < c.end_min; min += 30) {
        const key = `${day}-${min}`;
        if (!seen.has(key)) {
          seen.add(key);
          union.push({ day, min });
        }
      }
    }
    return { union, currentTeacherId: rem[0]?.teacher_id ?? "", currentTeacherName: rem[0]?.teacher_name ?? "" };
  }, [rows, now]);

  return (
    <div>
      {backHref && (
        <Link href={backHref} className="text-muted-fg hover:text-ink mb-3 inline-flex items-center gap-1 text-sm font-semibold transition-colors">
          <ArrowLeft className="size-4" aria-hidden /> 목록으로
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-ink text-2xl font-extrabold">{title}</h1>
          <p className="text-muted-fg mt-1 text-sm">{subtitle}</p>
        </div>
        {canBulkReschedule && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setBulkOpen(true)}
              className="bg-cta inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-bold text-white transition-opacity hover:opacity-90">
              <CalendarRange className="size-4" aria-hidden /> 남은 일정 일괄 변경
            </button>
            <button
              type="button"
              onClick={() => setBulkReassignOpen(true)}
              className="border-cta text-cta hover:bg-cta inline-flex h-9 items-center gap-1.5 rounded-md border px-4 text-sm font-bold transition-colors hover:text-white">
              <UserCog className="size-4" aria-hidden /> 남은 수업 전체 강사 대체
            </button>
          </div>
        )}
      </div>

      <div className="mt-5">
        <ViewToggle view={view} setView={setView} />
      </div>

      {view === "calendar" ? (
        <ClassAdminCalendar rows={rows} now={now} onSelect={setSelectedId} />
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-ink border-ink text-white"
                      : "border-rule text-muted-fg hover:border-accent-blue hover:text-accent-blue-ink bg-white",
                  )}>
                  {f.label} <span className={cn("ml-0.5", active ? "text-white/70" : "text-muted-fg-faint")}>{counts[f.key] ?? 0}</span>
                </button>
              );
            })}
          </div>

          <div className="border-rule mt-4 flex items-center gap-2 rounded-lg border bg-white px-3">
            <Search className="text-muted-fg-faint size-4" aria-hidden />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="학생·강사·과정 검색..."
              className="h-10 flex-1 bg-transparent text-sm outline-none"
            />
          </div>

          <div className="border-rule mt-4 overflow-x-auto rounded-xl border bg-white">
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <thead>
                <tr className="border-rule bg-surface text-muted-fg-faint border-b text-left text-xs font-semibold">
                  <th className="px-4 py-2.5 md:px-6">상태</th>
                  <SortHeader label="날짜" sortKey="date" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
                  <th className="px-4 py-2.5">시간</th>
                  <SortHeader label="강사" sortKey="teacher" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
                  <SortHeader label="회차" sortKey="session" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
                  <th className="px-4 py-2.5">진행</th>
                  <th className="px-4 py-2.5 md:px-6">피드백</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-muted-fg px-6 py-12 text-center text-sm">
                      표시할 수업이 없습니다.
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setSelectedId(r.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedId(r.id);
                        }
                      }}
                      tabIndex={0}
                      className={cn(
                        "border-rule hover:bg-surface/60 focus-visible:bg-surface/60 cursor-pointer border-b transition-colors outline-none last:border-b-0",
                        r.status === "취소" && "opacity-55",
                      )}>
                      <td className="px-4 py-3.5 align-middle md:px-6">
                        <div className="flex flex-col items-start gap-1.5">
                          {(() => {
                            const ds = displayStatus(r, now);
                            return <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold", STATUS_BADGE[ds])}>{ds}</span>;
                          })()}
                          {r.is_makeup && (
                            <span className="bg-progress/10 text-progress shrink-0 rounded-full px-2 py-0.5 text-xs font-bold">보강</span>
                          )}
                        </div>
                      </td>
                      <td className="text-ink px-4 py-3.5 align-middle whitespace-nowrap">{formatDateKo(r.session_date)}</td>
                      <td className="text-muted-fg px-4 py-3.5 align-middle whitespace-nowrap">{timeRange(r.start_min, r.end_min)}</td>
                      <td className="text-muted-fg px-4 py-3.5 align-middle">
                        <div className="flex items-center gap-1.5">
                          <span className="max-w-[10rem] truncate">{r.teacher_name ?? "강사"}</span>
                          {r.teacher_reassigned_at && (
                            <span className="bg-cta/10 text-cta shrink-0 rounded-full px-2 py-0.5 text-xs font-bold">대체</span>
                          )}
                        </div>
                      </td>
                      <td className="text-muted-fg-faint px-4 py-3.5 align-middle whitespace-nowrap">#{r.session_no}</td>
                      <td className="px-4 py-3.5 align-middle">
                        {(() => {
                          const ci = conductInfo(r, now);
                          return <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", ci.cls)}>{ci.label}</span>;
                        })()}
                      </td>
                      <td className="px-4 py-3.5 align-middle md:px-6">
                        <button
                          type="button"
                          disabled={!r.feedback}
                          onClick={(e) => {
                            e.stopPropagation();
                            setFeedbackTarget(r);
                          }}
                          className="border-rule text-accent-blue-ink hover:bg-accent-blue-soft/40 inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40">
                          <Eye className="size-3.5" aria-hidden /> 보기
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {selected && (
        <ClassDetailModal
          cls={selected}
          now={now}
          courseEnded={courseEnded}
          teachers={teachers}
          postponedCount={rows.filter((r) => r.status === "취소" && r.cancel_reason === "student").length}
          onClose={() => setSelectedId(null)}
          onUpdated={(updated) => setRows((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))}
        />
      )}

      {feedbackTarget && <FeedbackModal cls={feedbackTarget} onClose={() => setFeedbackTarget(null)} />}

      {bulkOpen && enrollmentId && (
        <RescheduleRemainingModal
          enrollmentId={enrollmentId}
          remainingCount={remainingCount}
          currentSlots={currentSlots}
          teacherSlots={teacherSlots}
          onClose={() => setBulkOpen(false)}
        />
      )}

      {bulkReassignOpen && enrollmentId && (
        <ReassignRemainingModal
          enrollmentId={enrollmentId}
          remainingCount={remainingCount}
          requestedSlots={bulkReassign.union}
          currentSlots={currentSlots}
          currentTeacherId={bulkReassign.currentTeacherId}
          currentTeacherName={bulkReassign.currentTeacherName}
          teachers={teachers}
          onClose={() => setBulkReassignOpen(false)}
        />
      )}
    </div>
  );
}

// 달력/목록 뷰 토글 — 강의실 CourseDetail의 ViewToggle과 동일 패턴(한국어 라벨).
function ViewToggle({ view, setView }: { view: View; setView: (v: View) => void }) {
  const tabs: [View, string][] = [
    ["calendar", "달력"],
    ["list", "목록"],
  ];
  return (
    <div className="bg-surface inline-flex rounded-lg p-1">
      {tabs.map(([key, label]) => (
        <button
          key={key}
          type="button"
          aria-pressed={view === key}
          onClick={() => setView(key)}
          className={cn(
            "focus-visible:ring-accent-blue/50 rounded-md px-4 py-1.5 text-sm font-bold transition-colors focus-visible:ring-2 focus-visible:outline-none",
            view === key ? "text-ink bg-white shadow-sm" : "text-muted-fg",
          )}>
          {label}
        </button>
      ))}
    </div>
  );
}

// admin 화상수업 상세 — 단일 과정 월간 달력. 예정/완료/취소 색 구분 + 진행여부 마커(● 진행됨 / ▲ 미진행),
// 날짜 클릭 시 그 날 회차 목록 → 행 클릭으로 기존 ClassDetailModal(onSelect=setSelectedId) 오픈.
const pad = (n: number) => String(n).padStart(2, "0");
const dateToStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

function ClassAdminCalendar({ rows, now, onSelect }: { rows: AdminClass[]; now: number; onSelect: (id: string) => void }) {
  const endMsOf = (r: AdminClass) => kstDateMinToMs(r.session_date, lessonEndMin(r.end_min));

  // 기본 포커스 = 다음 예정(종료 안 지난) 회차 → 없으면 마지막 회차 → 없으면 오늘. 1회만 계산.
  const [selected, setSelected] = useState<Date | undefined>(() => {
    const t = Date.now();
    const sorted = rows.slice().sort((a, b) => a.session_date.localeCompare(b.session_date));
    const src = sorted.find((r) => r.status !== "취소" && endMsOf(r) >= t) ?? sorted[sorted.length - 1];
    return src ? parseDate(src.session_date) : new Date();
  });

  const { byDate, upcoming, past, cancelled, conducted, unconducted } = useMemo(() => {
    const byDate = new Map<string, AdminClass[]>();
    for (const r of rows) {
      const arr = byDate.get(r.session_date) ?? [];
      arr.push(r);
      byDate.set(r.session_date, arr);
    }
    const upcoming: Date[] = [];
    const past: Date[] = [];
    const cancelled: Date[] = [];
    const conducted: Date[] = []; // ● 진행됨(유효 진행여부)
    const unconducted: Date[] = []; // ▲ 종료됐으나 미진행
    for (const [ds, items] of Array.from(byDate.entries())) {
      const date = parseDate(ds);
      const active = items.filter((r) => r.status !== "취소");
      if (active.some((r) => displayStatus(r, now) !== "완료")) upcoming.push(date);
      else if (active.length > 0) past.push(date);
      else cancelled.push(date);
      // 진행 마커 — 한 날짜에 진행됨 회차가 있으면 ● 우선, 없고 완료·미진행만 있으면 ▲.
      if (active.some((r) => effectiveConducted(r))) conducted.push(date);
      else if (active.some((r) => displayStatus(r, now) === "완료" && !effectiveConducted(r))) unconducted.push(date);
    }
    return { byDate, upcoming, past, cancelled, conducted, unconducted };
  }, [rows, now]);

  const selectedStr = selected ? dateToStr(selected) : "";
  const dayItems = (byDate.get(selectedStr) ?? []).slice().sort((a, b) => a.start_min - b.start_min);

  return (
    <div className="mt-4 space-y-4">
      <div className="flex justify-center">
        <div className="border-rule rounded-xl border bg-white p-3">
          <Calendar
            mode="single"
            required
            selected={selected}
            onSelect={setSelected}
            defaultMonth={selected}
            locale={koLocale}
            weekStartsOn={0}
            showOutsideDays={false}
            formatters={{ formatWeekdayName: (d: Date) => d.toLocaleDateString("ko-KR", { weekday: "short" }) }}
            modifiers={{ upcoming, past, cancelled, conducted, unconducted, sunday: { dayOfWeek: [0] }, saturday: { dayOfWeek: [6] } }}
            modifiersClassNames={{
              upcoming: "bg-accent-blue/10 text-accent-blue-ink font-bold rounded-(--cell-radius)",
              past: "bg-rule/60 text-muted-fg rounded-(--cell-radius)",
              cancelled: "text-muted-fg-faint line-through",
              conducted: "after:content-['●'] after:absolute after:top-0.5 after:right-1 after:text-[10px] after:leading-none after:text-cta",
              unconducted: "after:content-['▲'] after:absolute after:top-0.5 after:right-1 after:text-[10px] after:leading-none after:text-brand",
              sunday: "!text-brand",
              saturday: "!text-accent-blue-ink",
            }}
            classNames={{
              today: "bg-[#FFF3CD] text-ink font-bold ring-1 ring-[#F5A623] ring-inset rounded-(--cell-radius) !opacity-100",
            }}
            className="[&_.rdp-weekday:first-child]:!text-brand [&_.rdp-weekday:last-child]:!text-accent-blue-ink text-base [--cell-size:--spacing(10)]"
          />
        </div>
      </div>

      <p className="text-muted-fg-faint flex items-center justify-center gap-3 text-xs">
        <span className="inline-flex items-center gap-1">
          <span className="text-cta">●</span> 진행됨
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="text-brand">▲</span> 미진행
        </span>
      </p>

      <div className="border-rule overflow-hidden rounded-xl border bg-white">
        <div className="border-rule text-ink border-b px-4 py-3 text-sm font-bold md:px-6">
          {selectedStr ? formatDateKo(selectedStr) : ""} <span className="text-muted-fg-faint font-medium">· {dayItems.length}건</span>
        </div>
        {dayItems.length === 0 ? (
          <p className="text-muted-fg px-6 py-8 text-center text-sm">이 날은 수업이 없어요.</p>
        ) : (
          <ul className="list-none">
            {dayItems.map((r) => {
              const ds = displayStatus(r, now);
              const ci = conductInfo(r, now);
              return (
                <li
                  key={r.id}
                  onClick={() => onSelect(r.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(r.id);
                    }
                  }}
                  tabIndex={0}
                  className={cn(
                    "border-rule hover:bg-surface/60 focus-visible:bg-surface/60 flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-4 py-3 transition-colors outline-none last:border-b-0 md:px-6",
                    r.status === "취소" && "opacity-55",
                  )}>
                  <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold", STATUS_BADGE[ds])}>{ds}</span>
                  <span className="text-muted-fg shrink-0 text-sm whitespace-nowrap">{timeRange(r.start_min, r.end_min)}</span>
                  <span className="text-ink min-w-0 flex-1 truncate text-sm">{r.teacher_name ?? "강사"}</span>
                  {r.is_makeup && <span className="bg-progress/10 text-progress shrink-0 rounded-full px-2 py-0.5 text-xs font-bold">보강</span>}
                  {r.teacher_reassigned_at && <span className="bg-cta/10 text-cta shrink-0 rounded-full px-2 py-0.5 text-xs font-bold">대체</span>}
                  <span className="text-muted-fg-faint shrink-0 text-xs">#{r.session_no}</span>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-bold", ci.cls)}>{ci.label}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// 남은 수업 전체 주간 일정 일괄 변경 모달 — 담당 강사 유지, 요일·시간만. 성공 시 router.refresh로 목록 갱신.
function RescheduleRemainingModal({
  enrollmentId,
  remainingCount,
  currentSlots,
  teacherSlots,
  onClose,
}: {
  enrollmentId: string;
  remainingCount: number;
  currentSlots: Slot[];
  teacherSlots: Slot[];
  onClose: () => void;
}) {
  const router = useRouter();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [newSlots, setNewSlots] = useState<Slot[]>([]);
  // 적용 시작일 최소값 = 내일(KST) — 오늘·과거 배치로 인한 혼선(과거 시각·같은 날 중복) 방지.
  const minDateStr = useMemo(() => {
    const kstNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
    kstNow.setDate(kstNow.getDate() + 1);
    return kstNow.toLocaleDateString("en-CA");
  }, []);
  // 적용 시작일 최대값 = 오늘+7일(KST) — 남은 일정을 과도하게 먼 미래로 미는 실수 방지.
  const maxDateStr = useMemo(() => {
    const kstNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
    kstNow.setDate(kstNow.getDate() + 7);
    return kstNow.toLocaleDateString("en-CA");
  }, []);
  const [effectiveDate, setEffectiveDate] = useState(minDateStr);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const confirmingRef = useRef(false);
  confirmingRef.current = confirmOpen;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !confirmingRef.current) onClose();
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

  const withinAvailability = newSlots.length > 0 && teacherHasAllSlots(teacherSlots, newSlots);
  const canSubmit = newSlots.length > 0 && withinAvailability && effectiveDate >= minDateStr && effectiveDate <= maxDateStr && !pending;

  const doSubmit = () => {
    setConfirmOpen(false);
    startTransition(async () => {
      const res = await adminRescheduleRemaining(enrollmentId, newSlots, effectiveDate);
      if (res.ok) {
        toast.success(`남은 ${remainingCount}회 수업 일정을 변경했어요.`);
        router.refresh();
        onClose();
      } else {
        toast.error(res.error ?? "일정 변경 중 문제가 발생했어요.");
      }
    });
  };

  return (
    <>
      <div aria-hidden="true" onClick={onClose} className="fixed inset-0 z-[110] bg-black/40" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="남은 일정 일괄 변경"
        className="fixed top-1/2 left-1/2 z-[120] flex max-h-[90vh] w-[min(92vw,640px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="border-rule flex items-center justify-between gap-3 border-b px-6 py-4">
          <h2 className="text-ink truncate text-lg font-bold">
            남은 일정 일괄 변경 <span className="text-muted-fg-faint font-normal">· 남은 {remainingCount}회</span>
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-muted-fg-faint hover:text-ink focus-visible:ring-accent-blue/50 ml-1 shrink-0 rounded transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
            <X className="size-5" />
          </button>
        </div>

        <div className="overflow-auto px-6 py-5">
          <p className="text-muted-fg mb-1 text-sm">
            현재 주간 일정: <span className="text-ink font-semibold">{currentSlots.length > 0 ? summarizeSlots(currentSlots) : "-"}</span>
          </p>
          <p className="text-muted-fg-faint mb-4 text-xs">
            담당 강사는 유지되며, 선택한 시작일 이후 남은 {remainingCount}회 수업이 새 요일·시간으로 다시 배치됩니다. 과거·완료·취소 수업은
            그대로입니다.
          </p>

          <div className="space-y-4">
            <div>
              <span className="text-muted-fg-faint mb-1 block text-xs font-semibold">새 수업 요일·시간</span>
              <EnrollScheduleField onChange={setNewSlots} initialSlots={currentSlots} />
            </div>

            {newSlots.length > 0 && !withinAvailability && (
              <p className="text-brand bg-brand/5 border-brand/30 rounded-md border px-3 py-2 text-xs font-semibold">
                선택한 요일·시간이 담당 강사의 주간 가용시간에 없습니다. 다른 시간을 선택해 주세요.
              </p>
            )}

            <label className="flex flex-col gap-1">
              <span className="text-muted-fg-faint text-xs font-semibold">적용 시작일</span>
              <input
                type="date"
                min={minDateStr}
                max={maxDateStr}
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="border-rule-faint focus:border-accent-blue w-fit rounded-md border bg-white px-3 py-1.5 text-sm outline-none"
              />
            </label>
          </div>
        </div>

        <div className="border-rule flex justify-end gap-2 border-t px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="border-rule text-muted-fg hover:bg-surface rounded-md border px-4 py-2 text-sm font-bold transition-colors">
            닫기
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={!canSubmit}
            className="bg-cta inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50">
            {pending && <Loader2 className="size-3.5 animate-spin" />}
            일괄 변경
          </button>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="z-[130]">
          <AlertDialogHeader>
            <AlertDialogTitle>남은 수업 일정을 일괄 변경할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {effectiveDate}부터 남은 <span className="text-ink font-semibold">{remainingCount}회</span> 수업이{" "}
              <span className="text-ink font-semibold">{newSlots.length > 0 ? summarizeSlots(newSlots) : "-"}</span> 일정으로 다시 배치됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>돌아가기</AlertDialogCancel>
            <AlertDialogAction onClick={doSubmit} className="bg-cta hover:bg-cta/90 border-transparent text-white">
              일괄 변경
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// 남은 수업 전체 담당 강사 대체 모달(admin) — 강사 중도 하차 시. 담당 강사 교체 + enrollment 이관.
// 적용 시작일(선택): 비면 날짜 유지·강사만 교체, 지정하면 그 날부터 기존 주간 패턴으로 재배치.
function ReassignRemainingModal({
  enrollmentId,
  remainingCount,
  requestedSlots,
  currentSlots,
  currentTeacherId,
  currentTeacherName,
  teachers,
  onClose,
}: {
  enrollmentId: string;
  remainingCount: number;
  requestedSlots: Slot[];
  currentSlots: Slot[];
  currentTeacherId: string;
  currentTeacherName: string;
  teachers: EnrollTeacherCard[];
  onClose: () => void;
}) {
  const router = useRouter();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [selectedId, setSelectedId] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // 적용 시작일(선택) — 빈값=날짜 유지. 지정 시 D+1(KST)~D+7 범위.
  const minDateStr = useMemo(() => {
    const kstNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
    kstNow.setDate(kstNow.getDate() + 1);
    return kstNow.toLocaleDateString("en-CA");
  }, []);
  const maxDateStr = useMemo(() => {
    const kstNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
    kstNow.setDate(kstNow.getDate() + 7);
    return kstNow.toLocaleDateString("en-CA");
  }, []);
  const [effectiveDate, setEffectiveDate] = useState(minDateStr);

  // 재배치 주간 패턴 — enrollment.slots 우선, 없으면(레거시) 남은 클래스 union.
  const patternSlots = currentSlots.length > 0 ? currentSlots : requestedSlots;

  // 재배치 패턴에 가용한 강사만(현재 강사 제외). teacher.slots는 확정 예약 차감 후 값.
  const matches = useMemo(
    () => teachers.filter((t) => t.id !== currentTeacherId && teacherHasAllSlots(t.slots, patternSlots)),
    [teachers, currentTeacherId, patternSlots],
  );
  // 매칭에서 빠지면 선택 무효화.
  useEffect(() => {
    if (selectedId && !matches.some((t) => t.id === selectedId)) setSelectedId("");
  }, [matches, selectedId]);
  const selectedTeacher = matches.find((t) => t.id === selectedId) ?? null;

  const confirmingRef = useRef(false);
  confirmingRef.current = confirmOpen;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !confirmingRef.current) onClose();
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

  const canSubmit = !!selectedId && effectiveDate >= minDateStr && effectiveDate <= maxDateStr && !pending;

  const doSubmit = () => {
    setConfirmOpen(false);
    startTransition(async () => {
      const res = await adminReassignRemaining(enrollmentId, selectedId, effectiveDate);
      if (res.ok) {
        toast.success(`남은 ${remainingCount}회 수업을 ${selectedTeacher?.name ?? "새 강사"}(으)로 이관했어요.`);
        router.refresh();
        onClose();
      } else {
        toast.error(res.error ?? "강사 대체 중 문제가 발생했어요.");
      }
    });
  };

  return (
    <>
      <div aria-hidden="true" onClick={onClose} className="fixed inset-0 z-[110] bg-black/40" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="남은 수업 전체 강사 대체"
        className="fixed top-1/2 left-1/2 z-[120] flex max-h-[90vh] w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="border-rule flex items-center justify-between gap-3 border-b px-6 py-4">
          <h2 className="text-ink truncate text-lg font-bold">
            남은 수업 전체 강사 대체 <span className="text-muted-fg-faint font-normal">· 남은 {remainingCount}회</span>
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-muted-fg-faint hover:text-ink focus-visible:ring-accent-blue/50 ml-1 shrink-0 rounded transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
            <X className="size-5" />
          </button>
        </div>

        <div className="overflow-auto px-6 py-5">
          <p className="text-muted-fg mb-1 text-sm">
            현재 담당 강사: <span className="text-ink font-semibold">{currentTeacherName || "-"}</span>
          </p>
          <p className="text-muted-fg mb-1 text-sm">
            일정: <span className="text-ink font-semibold">{patternSlots.length > 0 ? summarizeSlots(patternSlots) : "-"}</span>
          </p>
          <p className="text-muted-fg-faint mb-4 text-xs">
            강사 중도 하차 시 사용하세요. 남은 {remainingCount}회 수업의 담당 강사를 교체하고, 선택한 시작일부터 기존 요일·시간으로 재배치하며,
            수강신청도 새 강사로 이관합니다. 과거·완료·취소 수업은 원 강사로 남습니다.
          </p>

          {matches.length === 0 ? (
            <p className="text-brand bg-brand/5 border-brand/30 rounded-md border px-3 py-2 text-xs font-semibold">
              해당 일정에 가능한 다른 강사가 없습니다. 먼저 남은 일정을 변경하거나 강사 가용시간을 확인해 주세요.
            </p>
          ) : (
            <div className="space-y-4">
              <label className="flex flex-col gap-1">
                <span className="text-muted-fg-faint text-xs font-semibold">새 담당 강사</span>
                <select
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className="border-rule-faint focus:border-accent-blue w-full rounded-md border bg-white px-3 py-2 text-sm outline-none">
                  <option value="">강사 선택...</option>
                  {matches.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.centerName ? ` · ${t.centerName}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-muted-fg-faint text-xs font-semibold">적용 시작일</span>
                <input
                  type="date"
                  min={minDateStr}
                  max={maxDateStr}
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  className="border-rule-faint focus:border-accent-blue w-fit rounded-md border bg-white px-3 py-1.5 text-sm outline-none"
                />
                <span className="text-muted-fg-faint text-xs">
                  {effectiveDate
                    ? `${effectiveDate}부터 남은 ${remainingCount}회 수업을 기존 요일·시간으로 재배치합니다.`
                    : "적용 시작일을 선택해 주세요."}
                </span>
              </label>
            </div>
          )}
        </div>

        <div className="border-rule flex justify-end gap-2 border-t px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="border-rule text-muted-fg hover:bg-surface rounded-md border px-4 py-2 text-sm font-bold transition-colors">
            닫기
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={!canSubmit}
            className="bg-cta inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50">
            {pending && <Loader2 className="size-3.5 animate-spin" />}
            강사 대체
          </button>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="z-[130]">
          <AlertDialogHeader>
            <AlertDialogTitle>남은 수업 담당 강사를 대체할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              남은 <span className="text-ink font-semibold">{remainingCount}회</span> 수업의 담당 강사가{" "}
              <span className="text-ink font-semibold">{selectedTeacher?.name ?? "-"}</span> 강사로 변경되며, 수강신청도 새 강사로 이관됩니다. 수업
              일정은 <span className="text-ink font-semibold">{effectiveDate}</span>부터 기존 요일·시간으로 재배치됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>돌아가기</AlertDialogCancel>
            <AlertDialogAction onClick={doSubmit} className="bg-cta hover:bg-cta/90 border-transparent text-white">
              강사 대체
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// 강사 피드백 전용 읽기 모달(admin) — "보기" 버튼에서 열림. ClassDetailModal과 동일 a11y 패턴.
function FeedbackModal({ cls, onClose }: { cls: AdminClass; onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
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

  const studentLabel = cls.student_name ?? "학생";

  return (
    <>
      <div aria-hidden="true" onClick={onClose} className="fixed inset-0 z-[110] bg-black/40" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`강사 피드백 · ${studentLabel}`}
        className="fixed top-1/2 left-1/2 z-[120] flex max-h-[90vh] w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="border-rule flex items-center justify-between gap-3 border-b px-6 py-4">
          <h2 className="text-ink truncate text-lg font-bold">
            강사 피드백
            <span className="text-muted-fg-faint font-normal">
              {" "}
              · {studentLabel} · {cls.session_no}회차
            </span>
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-muted-fg-faint hover:text-ink focus-visible:ring-accent-blue/50 ml-1 shrink-0 rounded transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
            <X className="size-5" />
          </button>
        </div>

        <div className="overflow-auto px-6 py-5">
          {cls.feedback_at && <p className="text-muted-fg-faint mb-2 text-xs">{new Date(cls.feedback_at).toLocaleDateString("ko-KR")}</p>}
          <p className="text-ink-soft text-sm break-words whitespace-pre-wrap">{cls.feedback}</p>
        </div>

        <div className="border-rule flex justify-end gap-2 border-t px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="border-rule text-muted-fg hover:bg-surface rounded-md border px-4 py-2 text-sm font-bold transition-colors">
            닫기
          </button>
        </div>
      </div>
    </>
  );
}

function ClassDetailModal({
  cls: row,
  now,
  courseEnded,
  teachers,
  postponedCount,
  onClose,
  onUpdated,
}: {
  cls: AdminClass;
  now: number;
  courseEnded: boolean;
  teachers: EnrollTeacherCard[];
  postponedCount: number; // 이 과정의 학생 연기(cancel_reason='student') 누적 수
  onClose: () => void;
  onUpdated: (updated: AdminClass) => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [conductOpen, setConductOpen] = useState(false);
  const [conductTarget, setConductTarget] = useState<boolean | null>(null);
  // 연기/취소 사유: 'student' 수강생 요구(보강·차감) / 'company' 회사 사유(보강·미차감) / 'cancel' 취소(보강 없음).
  const [cancelReason, setCancelReason] = useState<"student" | "company" | "cancel">("student");
  const remainingPostpone = Math.max(0, MAX_CANCELLATIONS - postponedCount);
  const [newTeacherId, setNewTeacherId] = useState("");
  const [pending, startTransition] = useTransition();
  const editable = row.status === "예정" && !courseEnded;
  const isEnded = displayStatus(row, now) === "완료"; // 종료된 회차(취소 제외) — 강사 대체 무의미.
  const hasStarted = now >= kstDateMinToMs(row.session_date, row.start_min); // 시작 시각 지난 회차 — 강사 대체 불가(연기/취소만).
  // 유효 진행여부(정산·마커와 동일 기준=override ?? conducted_at). 진행됨만 완전 읽기전용, 미진행(자동/수동)은 종료돼도 연기/취소 허용.
  const isConducted = row.conducted_override ?? !!row.conducted_at;
  const canEditConducted = isEnded && row.status !== "취소"; // 진행 여부 수동 보정 — 종료된 수업만.

  // 이 수업 시간(요일+30분 슬롯)에 가용한 대체 강사 — 원 강사 제외.
  const reassignMatches = useMemo(() => {
    const [y, m, d] = row.session_date.split("-").map(Number);
    if (!y || !m || !d) return [];
    const dow = new Date(y, m - 1, d).getDay();
    const requested: Slot[] = [];
    for (let min = row.start_min; min < row.end_min; min += 30) requested.push({ day: dow, min });
    return teachers.filter((t) => t.id !== row.teacher_id && teacherHasAllSlots(t.slots, requested));
  }, [teachers, row.session_date, row.start_min, row.end_min, row.teacher_id]);

  const selectedNewTeacher = reassignMatches.find((t) => t.id === newTeacherId) ?? null;

  const confirmingRef = useRef(false);
  confirmingRef.current = cancelOpen || reassignOpen || conductOpen;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !confirmingRef.current) onClose();
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

  const studentLabel = row.student_name ?? "학생";

  const doCancel = () => {
    setCancelOpen(false);
    startTransition(async () => {
      const res = await adminCancelClass(row.id, cancelReason);
      if (res.ok) {
        onUpdated({ ...row, status: "취소", cancel_reason: cancelReason });
        toast.success(
          cancelReason === "cancel"
            ? "수업을 취소했어요."
            : cancelReason === "student"
              ? "수업을 연기하고 보강을 생성했어요. (남은 연기 1회 차감)"
              : "수업을 연기하고 보강을 생성했어요.",
        );
        onClose();
      } else {
        toast.error(res.error ?? "처리 중 문제가 발생했어요.");
      }
    });
  };

  const doReassign = () => {
    const target = selectedNewTeacher;
    setReassignOpen(false);
    if (!target) return;
    startTransition(async () => {
      const res = await adminReassignClass(row.id, target.id);
      if (res.ok) {
        onUpdated({ ...row, teacher_id: target.id, teacher_name: target.name, teacher_reassigned_at: new Date().toISOString() });
        toast.success(`담당 강사를 ${target.name} 강사로 변경했어요.`);
        onClose();
      } else {
        toast.error(res.error ?? "강사 변경 중 문제가 발생했어요.");
      }
    });
  };

  // 진행 여부 수동 보정 — 확인 후 override 저장(모달은 닫지 않고 값만 갱신).
  const doSetConducted = () => {
    const target = conductTarget;
    setConductOpen(false);
    startTransition(async () => {
      const res = await adminSetClassConducted(row.id, target);
      if (res.ok) {
        onUpdated({ ...row, conducted_override: target });
        toast.success(target === null ? "자동 판정으로 되돌렸어요." : target ? "진행됨으로 지정했어요." : "미진행으로 지정했어요.");
      } else {
        toast.error(res.error ?? "진행 여부 저장 중 문제가 발생했어요.");
      }
    });
  };

  return (
    <>
      <div aria-hidden="true" onClick={onClose} className="fixed inset-0 z-[110] bg-black/40" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${studentLabel} · ${row.course_title}`}
        className="fixed top-1/2 left-1/2 z-[120] flex max-h-[90vh] w-[min(92vw,640px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="border-rule flex items-center justify-between gap-3 border-b px-6 py-4">
          <div className="flex min-w-0 items-center gap-2">
            {(() => {
              const ds = displayStatus(row, now);
              return <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold", STATUS_BADGE[ds])}>{ds}</span>;
            })()}
            {row.is_makeup && <span className="bg-progress/10 text-progress shrink-0 rounded-full px-2 py-0.5 text-xs font-bold">보강</span>}
            <h2 className="text-ink truncate text-lg font-bold">
              {studentLabel}
              <span className="text-muted-fg-faint font-normal"> · {row.teacher_name ?? "강사"}</span>
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-muted-fg-faint hover:text-ink focus-visible:ring-accent-blue/50 ml-1 shrink-0 rounded transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
            <X className="size-5" />
          </button>
        </div>

        <div className="overflow-auto px-6 py-5">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm">
            {[
              ["학생", row.student_name ?? "-"],
              ["영문명", row.student_english_name ?? "-"],
              ["강사", row.teacher_name ?? "-"],
              ["과정", row.course_title],
              ["회차", `${row.session_no}회차${row.is_makeup ? " (보강)" : ""}`],
              ["날짜", formatDateKo(row.session_date)],
              ["시간", timeRange(row.start_min, row.end_min)],
              ["진행 여부", conductInfo(row, now).label],
              ["강사 입장", row.teacher_entered_at ? `입장함 · ${new Date(row.teacher_entered_at).toLocaleString("ko-KR")}` : "미입장"],
              [
                "피드백 작성",
                row.feedback ? `작성함${row.feedback_at ? ` · ${new Date(row.feedback_at).toLocaleDateString("ko-KR")}` : ""}` : "미작성",
              ],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-2">
                <dt className="text-muted-fg-faint w-24 shrink-0">{label}</dt>
                <dd className="text-ink break-words whitespace-pre-wrap">{value}</dd>
              </div>
            ))}
          </dl>

          {/* 미진행 사유 — 완료·자동판정(override 없음)·미인정일 때만 */}
          {displayStatus(row, now) === "완료" && row.conducted_override === null && !row.conducted_at && unconductedReason(row) && (
            <div className="border-brand/30 bg-brand/5 mt-4 rounded-lg border p-3">
              <p className="text-brand text-sm font-semibold">미진행 사유: {unconductedReason(row)}</p>
            </div>
          )}

          {/* 강사 피드백(읽기 전용) */}
          {row.feedback && (
            <div className="border-accent-blue-soft bg-accent-blue-soft/30 mt-4 rounded-lg border p-3">
              <p className="text-accent-blue-ink mb-1 text-xs font-bold">
                강사 피드백{row.feedback_at ? ` · ${new Date(row.feedback_at).toLocaleDateString("ko-KR")}` : ""}
              </p>
              <p className="text-ink-soft text-sm break-words whitespace-pre-wrap">{row.feedback}</p>
            </div>
          )}

          {/* 진행 여부 수동 보정 — 종료된 수업만(취소 제외). 취소/대체 읽기전용 여부와 독립. */}
          {canEditConducted && (
            <section className="border-rule mt-6 rounded-lg border p-4">
              <h3 className="text-ink text-sm font-bold">진행 여부 수정</h3>
              <p className="text-muted-fg-faint mt-1 text-xs">
                자동 판정(강사 입장 + 피드백 작성)이 실제와 다를 때 직접 지정합니다. 정산·강사 강의실 표시에 반영됩니다. 자동 판정 결과:{" "}
                <span className="font-semibold">{row.conducted_at ? "진행됨" : "미진행"}</span>
              </p>
              <div className="border-rule-faint mt-3 inline-flex overflow-hidden rounded-md border">
                {(
                  [
                    { value: null, label: "자동" },
                    { value: true, label: "진행됨" },
                    { value: false, label: "미진행" },
                  ] as { value: boolean | null; label: string }[]
                ).map((opt, i) => {
                  const active = row.conducted_override === opt.value;
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      disabled={pending || active}
                      onClick={() => {
                        setConductTarget(opt.value);
                        setConductOpen(true);
                      }}
                      className={cn(
                        "px-4 py-1.5 text-sm font-semibold transition-colors disabled:opacity-100",
                        i > 0 && "border-rule-faint border-l",
                        active ? "bg-cta text-white" : "text-muted-fg hover:bg-surface",
                      )}>
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {editable ? (
            isConducted ? (
              <p className="text-muted-fg mt-5 text-sm">진행 완료된 수업입니다(읽기 전용).</p>
            ) : (
              <div className="mt-6 space-y-6">
                {!hasStarted && (
                  <>
                    {/* 강사 대체 */}
                    <section className="border-rule rounded-lg border p-4">
                      <h3 className="text-ink flex items-center gap-1.5 text-sm font-bold">
                        <UserCog className="size-4" aria-hidden /> 강사 대체
                      </h3>
                      <p className="text-muted-fg-faint mt-1 text-xs">
                        강사 사정으로 이 회차를 진행할 수 없을 때, 같은 요일·시간에 가능한 다른 강사로 교체합니다.
                      </p>
                      {reassignMatches.length === 0 ? (
                        <p className="text-muted-fg mt-3 text-sm">이 시간에 대체 가능한 강사가 없습니다.</p>
                      ) : (
                        <div className="mt-3 flex flex-wrap items-end gap-3">
                          <label className="flex flex-col gap-1">
                            <span className="text-muted-fg-faint text-xs font-semibold">대체 강사</span>
                            <select
                              value={newTeacherId}
                              onChange={(e) => setNewTeacherId(e.target.value)}
                              className="border-rule-faint focus:border-accent-blue min-w-[12rem] rounded-md border bg-white px-3 py-1.5 text-sm outline-none">
                              <option value="">선택하세요</option>
                              {reassignMatches.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                  {t.centerName ? ` · ${t.centerName}` : ""}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              if (!selectedNewTeacher) {
                                toast.error("대체할 강사를 선택해 주세요.");
                                return;
                              }
                              setReassignOpen(true);
                            }}
                            disabled={pending}
                            className="bg-cta inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50">
                            {pending && <Loader2 className="size-3.5 animate-spin" />}
                            강사 대체
                          </button>
                        </div>
                      )}
                    </section>
                  </>
                )}

                {hasStarted && (
                  <p className="text-muted-fg-faint text-xs">
                    이미 시작된 수업이라 강사 대체는 할 수 없습니다. (노쇼 사후 처리를 위한 연기·취소만 가능)
                  </p>
                )}

                {/* 수업 연기/취소 */}
                <section className="border-brand/30 rounded-lg border p-4">
                  <h3 className="text-brand text-sm font-bold">수업 연기/취소</h3>
                  <div className="mt-3 flex flex-col gap-2.5">
                    {(
                      [
                        { value: "student", label: "수업 연기 (수강생 요구)", desc: "보강 생성 · 남은 연기 1회 차감" },
                        { value: "company", label: "수업 연기 (강사·회사 사유)", desc: "보강 생성 · 차감 없음" },
                        { value: "cancel", label: "수업 취소", desc: "보강 없음" },
                      ] as const
                    ).map((opt) => (
                      <label key={opt.value} className="flex cursor-pointer items-start gap-2 text-sm">
                        <input
                          type="radio"
                          name="cancel-reason"
                          value={opt.value}
                          checked={cancelReason === opt.value}
                          onChange={() => setCancelReason(opt.value)}
                          className="mt-0.5 size-4"
                        />
                        <span>
                          <span className="text-ink font-semibold">{opt.label}</span>
                          <span className="text-muted-fg-faint block text-xs">{opt.desc}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="text-muted-fg-faint mt-3 text-xs">
                    남은 연기 <span className={cn("font-bold", remainingPostpone === 0 ? "text-brand" : "text-ink")}>{remainingPostpone}</span> /{" "}
                    {MAX_CANCELLATIONS}
                  </p>
                  <button
                    type="button"
                    onClick={() => setCancelOpen(true)}
                    disabled={pending}
                    className="border-brand/40 text-brand hover:bg-brand/5 mt-3 inline-flex h-9 items-center gap-1.5 rounded-md border px-4 text-sm font-bold transition-colors disabled:opacity-50">
                    {pending && <Loader2 className="size-3.5 animate-spin" />}
                    적용
                  </button>
                </section>
              </div>
            )
          ) : row.status === "취소" ? (
            <p className="text-muted-fg mt-5 text-sm">취소된 수업입니다(읽기 전용).</p>
          ) : (
            <p className="text-muted-fg mt-5 text-sm">종료된 과정의 수업입니다(읽기 전용).</p>
          )}
        </div>

        <div className="border-rule flex justify-end gap-2 border-t px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="border-rule text-muted-fg hover:bg-surface rounded-md border px-4 py-2 text-sm font-bold transition-colors">
            닫기
          </button>
        </div>
      </div>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent className="z-[130]">
          <AlertDialogHeader>
            <AlertDialogTitle>{cancelReason === "cancel" ? "이 수업을 취소할까요?" : "이 수업을 연기할까요?"}</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="text-ink font-semibold">{studentLabel}</span>님의 {row.session_date} {timeRange(row.start_min, row.end_min)} 수업을{" "}
              {cancelReason === "cancel" ? "취소합니다. 보강은 생성되지 않습니다." : "연기하고 보강 수업을 자동 생성합니다."}
              {cancelReason === "student" &&
                (remainingPostpone <= 0 ? " 남은 연기가 없지만 관리자 재량으로 진행합니다(한도 초과)." : " 남은 연기 1회가 차감됩니다.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>돌아가기</AlertDialogCancel>
            <AlertDialogAction onClick={doCancel} className="bg-brand hover:bg-brand/90 border-transparent text-white">
              {cancelReason === "cancel" ? "수업 취소" : "수업 연기"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={reassignOpen} onOpenChange={setReassignOpen}>
        <AlertDialogContent className="z-[130]">
          <AlertDialogHeader>
            <AlertDialogTitle>담당 강사를 변경할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="text-ink font-semibold">{studentLabel}</span>님의 {row.session_date} {timeRange(row.start_min, row.end_min)} 수업을{" "}
              <span className="text-ink font-semibold">{selectedNewTeacher?.name ?? "선택한 강사"}</span> 강사로 변경합니다. 기존 강사의 강의실에서는
              이 수업이 사라집니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>돌아가기</AlertDialogCancel>
            <AlertDialogAction onClick={doReassign} className="bg-cta hover:bg-cta/90 border-transparent text-white">
              강사 대체
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={conductOpen} onOpenChange={setConductOpen}>
        <AlertDialogContent className="z-[130]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {conductTarget === null ? "자동 판정으로 되돌릴까요?" : conductTarget ? "진행됨으로 지정할까요?" : "미진행으로 지정할까요?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              <span className="text-ink font-semibold">{studentLabel}</span>님의 {row.session_date} {timeRange(row.start_min, row.end_min)} 수업을{" "}
              {conductTarget === null ? (
                <>자동 판정(강사 입장 + 피드백)으로 되돌립니다.</>
              ) : conductTarget ? (
                <>
                  <span className="text-cta font-semibold">진행됨</span>으로 처리합니다. 강사 정산 지급 대상에 포함됩니다.
                </>
              ) : (
                <>
                  <span className="text-brand font-semibold">미진행</span>으로 처리합니다. 강사 정산 지급 대상에서 제외됩니다.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>돌아가기</AlertDialogCancel>
            <AlertDialogAction onClick={doSetConducted} className="bg-cta hover:bg-cta/90 border-transparent text-white">
              지정
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

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
