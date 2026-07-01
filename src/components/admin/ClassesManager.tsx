"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, CalendarClock, CalendarRange, Eye, Loader2, Search, UserCog, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { adminCancelClass, adminRescheduleClass, adminReassignClass, adminRescheduleRemaining, adminReassignRemaining } from "@/app/admin/actions";
import { fmtTime, GRID_START_HOUR, GRID_END_HOUR, SLOT_MIN, lessonEndMin, summarizeSlots, teacherHasAllSlots, type Slot } from "@/lib/availability";
import type { EnrollTeacherCard } from "@/app/courses/enroll-actions";
import EnrollScheduleField from "@/components/course/EnrollScheduleField";
import { kstDateMinToMs } from "@/lib/classtime";
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
  feedback: string | null;
  feedback_at: string | null;
  teacher_entered_at: string | null;
  conducted_at: string | null;
};

type DisplayStatus = "예정" | "완료" | "취소";

// 표시 상태 — DB status(예정/취소)에 시간 기반 '완료'를 더해 파생(강의실·상위 목록과 동일 기준: 레슨 종료 시각 지나면 완료).
function displayStatus(r: AdminClass, now: number): DisplayStatus {
  if (r.status === "취소") return "취소";
  return now >= kstDateMinToMs(r.session_date, lessonEndMin(r.end_min)) ? "완료" : "예정";
}

const STATUS_BADGE: Record<DisplayStatus, string> = {
  예정: "bg-accent-blue-soft text-accent-blue-ink",
  완료: "bg-rule text-muted-fg",
  취소: "bg-brand/10 text-brand",
};

// 진행 여부 표시 — 진행됨(인정)/미진행(종료됐는데 미인정)/− (예정·취소).
function conductInfo(r: AdminClass, now: number): { label: string; cls: string } {
  if (r.conducted_at) return { label: "진행됨", cls: "bg-cta/10 text-cta" };
  if (displayStatus(r, now) === "완료") return { label: "미진행", cls: "bg-brand/10 text-brand" };
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
  { key: "완료", label: "완료" },
  { key: "취소", label: "취소" },
];

type SortKey = "date" | "teacher" | "session";

const SORT_VALUE: Record<SortKey, (r: AdminClass) => string> = {
  date: (r) => r.session_date,
  teacher: (r) => r.teacher_name ?? "",
  session: (r) => String(r.session_no).padStart(3, "0"),
};

// 시각 <select> 옵션 — 06:00~24:00, 30분.
const TIME_OPTIONS: { min: number; label: string }[] = [];
for (let m = GRID_START_HOUR * 60; m <= GRID_END_HOUR * 60; m += SLOT_MIN) TIME_OPTIONS.push({ min: m, label: fmtTime(m) });

function timeRange(start: number, end: number): string {
  return `${fmtTime(start)}~${fmtTime(end)}`;
}

export default function ClassesManager({
  classes,
  teachers = [],
  enrollmentId,
  currentSlots = [],
  teacherSlots = [],
  title = "화상수업 관리",
  subtitle = "결제 확정 시 생성된 전체 수업입니다. 예정 수업은 강제 취소(보강 옵션)·일정 변경·강사 대체할 수 있습니다.",
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

  const toggleSort = (key: SortKey) => setSort((prev) => (prev?.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const counts = useMemo(() => {
    const c: Record<string, number> = { 전체: rows.length, 예정: 0, 완료: 0, 취소: 0 };
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
              className="bg-cta inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-bold text-white transition-opacity hover:opacity-90"
            >
              <CalendarRange className="size-4" aria-hidden /> 남은 일정 일괄 변경
            </button>
            <button
              type="button"
              onClick={() => setBulkReassignOpen(true)}
              className="border-cta text-cta hover:bg-cta inline-flex h-9 items-center gap-1.5 rounded-md border px-4 text-sm font-bold transition-colors hover:text-white"
            >
              <UserCog className="size-4" aria-hidden /> 남은 수업 전체 강사 대체
            </button>
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
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
                active ? "bg-ink border-ink text-white" : "border-rule text-muted-fg hover:border-accent-blue hover:text-accent-blue-ink bg-white",
              )}
            >
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
                  )}
                >
                  <td className="px-4 py-3.5 align-middle md:px-6">
                    <div className="flex flex-col items-start gap-1.5">
                      {(() => {
                        const ds = displayStatus(r, now);
                        return <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold", STATUS_BADGE[ds])}>{ds}</span>;
                      })()}
                      {r.is_makeup && <span className="bg-progress/10 text-progress shrink-0 rounded-full px-2 py-0.5 text-xs font-bold">보강</span>}
                    </div>
                  </td>
                  <td className="text-ink px-4 py-3.5 align-middle whitespace-nowrap">{r.session_date}</td>
                  <td className="text-muted-fg px-4 py-3.5 align-middle whitespace-nowrap">{timeRange(r.start_min, r.end_min)}</td>
                  <td className="text-muted-fg max-w-[10rem] truncate px-4 py-3.5 align-middle">{r.teacher_name ?? "강사"}</td>
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
                      className="border-rule text-accent-blue-ink hover:bg-accent-blue-soft/40 inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Eye className="size-3.5" aria-hidden /> 보기
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <ClassDetailModal
          cls={selected}
          now={now}
          courseEnded={courseEnded}
          teachers={teachers}
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
        className="fixed top-1/2 left-1/2 z-[120] flex max-h-[90vh] w-[min(92vw,640px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        <div className="border-rule flex items-center justify-between gap-3 border-b px-6 py-4">
          <h2 className="text-ink truncate text-lg font-bold">
            남은 일정 일괄 변경 <span className="text-muted-fg-faint font-normal">· 남은 {remainingCount}회</span>
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-muted-fg-faint hover:text-ink focus-visible:ring-accent-blue/50 ml-1 shrink-0 rounded transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="overflow-auto px-6 py-5">
          <p className="text-muted-fg mb-1 text-sm">
            현재 주간 일정: <span className="text-ink font-semibold">{currentSlots.length > 0 ? summarizeSlots(currentSlots) : "-"}</span>
          </p>
          <p className="text-muted-fg-faint mb-4 text-xs">담당 강사는 유지되며, 선택한 시작일 이후 남은 {remainingCount}회 수업이 새 요일·시간으로 다시 배치됩니다. 과거·완료·취소 수업은 그대로입니다.</p>

          <div className="space-y-4">
            <div>
              <span className="text-muted-fg-faint mb-1 block text-xs font-semibold">새 수업 요일·시간</span>
              <EnrollScheduleField onChange={setNewSlots} />
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
            className="border-rule text-muted-fg hover:bg-surface rounded-md border px-4 py-2 text-sm font-bold transition-colors"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={!canSubmit}
            className="bg-cta inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
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
        className="fixed top-1/2 left-1/2 z-[120] flex max-h-[90vh] w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        <div className="border-rule flex items-center justify-between gap-3 border-b px-6 py-4">
          <h2 className="text-ink truncate text-lg font-bold">
            남은 수업 전체 강사 대체 <span className="text-muted-fg-faint font-normal">· 남은 {remainingCount}회</span>
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-muted-fg-faint hover:text-ink focus-visible:ring-accent-blue/50 ml-1 shrink-0 rounded transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
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
            강사 중도 하차 시 사용하세요. 남은 {remainingCount}회 수업의 담당 강사를 교체하고, 선택한 시작일부터 기존 요일·시간으로 재배치하며, 수강신청도 새 강사로 이관합니다. 과거·완료·취소 수업은 원 강사로 남습니다.
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
                  className="border-rule-faint focus:border-accent-blue w-full rounded-md border bg-white px-3 py-2 text-sm outline-none"
                >
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
                  {effectiveDate ? `${effectiveDate}부터 남은 ${remainingCount}회 수업을 기존 요일·시간으로 재배치합니다.` : "적용 시작일을 선택해 주세요."}
                </span>
              </label>
            </div>
          )}
        </div>

        <div className="border-rule flex justify-end gap-2 border-t px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="border-rule text-muted-fg hover:bg-surface rounded-md border px-4 py-2 text-sm font-bold transition-colors"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={!canSubmit}
            className="bg-cta inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
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
              <span className="text-ink font-semibold">{selectedTeacher?.name ?? "-"}</span> 강사로 변경되며, 수강신청도 새 강사로 이관됩니다. 수업 일정은{" "}
              <span className="text-ink font-semibold">{effectiveDate}</span>부터 기존 요일·시간으로 재배치됩니다.
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
        className="fixed top-1/2 left-1/2 z-[120] flex max-h-[90vh] w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
      >
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
            className="text-muted-fg-faint hover:text-ink focus-visible:ring-accent-blue/50 ml-1 shrink-0 rounded transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
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
            className="border-rule text-muted-fg hover:bg-surface rounded-md border px-4 py-2 text-sm font-bold transition-colors"
          >
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
  onClose,
  onUpdated,
}: {
  cls: AdminClass;
  now: number;
  courseEnded: boolean;
  teachers: EnrollTeacherCard[];
  onClose: () => void;
  onUpdated: (updated: AdminClass) => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [makeup, setMakeup] = useState(true);
  const [date, setDate] = useState(row.session_date);
  const [startMin, setStartMin] = useState(row.start_min);
  const [endMin, setEndMin] = useState(row.end_min);
  const [newTeacherId, setNewTeacherId] = useState("");
  const [pending, startTransition] = useTransition();
  const editable = row.status === "예정" && !courseEnded;
  const isEnded = displayStatus(row, now) === "완료"; // 종료된 회차(취소 제외) — 일정 변경·강사 대체 무의미.
  const isConducted = !!row.conducted_at; // 진행됨(conducted⇒이미 종료) — 취소까지 무의미, 완전 읽기전용.

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
  confirmingRef.current = cancelOpen || rescheduleOpen || reassignOpen;
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
      const res = await adminCancelClass(row.id, makeup);
      if (res.ok) {
        onUpdated({ ...row, status: "취소" });
        toast.success(makeup ? "수업을 취소하고 보강을 생성했어요." : "수업을 취소했어요.");
        onClose();
      } else {
        toast.error(res.error ?? "취소 중 문제가 발생했어요.");
      }
    });
  };

  const askReschedule = () => {
    if (startMin >= endMin) {
      toast.error("종료 시각은 시작 시각보다 뒤여야 해요.");
      return;
    }
    setRescheduleOpen(true);
  };

  const doReschedule = () => {
    setRescheduleOpen(false);
    startTransition(async () => {
      const res = await adminRescheduleClass(row.id, date, startMin, endMin);
      if (res.ok) {
        onUpdated({ ...row, session_date: date, start_min: startMin, end_min: endMin });
        toast.success("수업 일정을 변경했어요.");
        onClose();
      } else {
        toast.error(res.error ?? "일정 변경 중 문제가 발생했어요.");
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
        onUpdated({ ...row, teacher_id: target.id, teacher_name: target.name });
        toast.success(`담당 강사를 ${target.name} 강사로 변경했어요.`);
        onClose();
      } else {
        toast.error(res.error ?? "강사 변경 중 문제가 발생했어요.");
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
        className="fixed top-1/2 left-1/2 z-[120] flex max-h-[90vh] w-[min(92vw,640px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
      >
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
            className="text-muted-fg-faint hover:text-ink focus-visible:ring-accent-blue/50 ml-1 shrink-0 rounded transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
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
              ["날짜", row.session_date],
              ["시간", timeRange(row.start_min, row.end_min)],
              ["진행 여부", conductInfo(row, now).label],
              ["강사 입장", row.teacher_entered_at ? `입장함 · ${new Date(row.teacher_entered_at).toLocaleString("ko-KR")}` : "미입장"],
              ["피드백 작성", row.feedback ? `작성함${row.feedback_at ? ` · ${new Date(row.feedback_at).toLocaleDateString("ko-KR")}` : ""}` : "미작성"],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-2">
                <dt className="text-muted-fg-faint w-24 shrink-0">{label}</dt>
                <dd className="text-ink break-words whitespace-pre-wrap">{value}</dd>
              </div>
            ))}
          </dl>

          {/* 미진행 사유 — 완료됐으나 미인정일 때만 */}
          {displayStatus(row, now) === "완료" && !row.conducted_at && unconductedReason(row) && (
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

          {editable ? (
            isConducted ? (
              <p className="text-muted-fg mt-5 text-sm">진행 완료된 수업입니다(읽기 전용).</p>
            ) : (
            <div className="mt-6 space-y-6">
              {!isEnded && (
                <>
              {/* 일정 변경 */}
              <section className="border-rule rounded-lg border p-4">
                <h3 className="text-ink flex items-center gap-1.5 text-sm font-bold">
                  <CalendarClock className="size-4" aria-hidden /> 일정 변경
                </h3>
                <p className="text-muted-fg-faint mt-1 text-xs">강사 가용시간 안이고 다른 예정 수업과 겹치지 않는 시간만 저장됩니다.</p>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-muted-fg-faint text-xs font-semibold">날짜</span>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="border-rule-faint focus:border-accent-blue rounded-md border bg-white px-3 py-1.5 text-sm outline-none"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-muted-fg-faint text-xs font-semibold">시작</span>
                    <select
                      value={startMin}
                      onChange={(e) => setStartMin(Number(e.target.value))}
                      className="border-rule-faint focus:border-accent-blue rounded-md border bg-white px-3 py-1.5 text-sm outline-none"
                    >
                      {TIME_OPTIONS.filter((o) => o.min < GRID_END_HOUR * 60).map((o) => (
                        <option key={o.min} value={o.min}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-muted-fg-faint text-xs font-semibold">종료</span>
                    <select
                      value={endMin}
                      onChange={(e) => setEndMin(Number(e.target.value))}
                      className="border-rule-faint focus:border-accent-blue rounded-md border bg-white px-3 py-1.5 text-sm outline-none"
                    >
                      {TIME_OPTIONS.filter((o) => o.min > GRID_START_HOUR * 60).map((o) => (
                        <option key={o.min} value={o.min}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={askReschedule}
                    disabled={pending}
                    className="bg-cta inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {pending && <Loader2 className="size-3.5 animate-spin" />}
                    일정 변경
                  </button>
                </div>
              </section>

              {/* 강사 대체 */}
              <section className="border-rule rounded-lg border p-4">
                <h3 className="text-ink flex items-center gap-1.5 text-sm font-bold">
                  <UserCog className="size-4" aria-hidden /> 강사 대체
                </h3>
                <p className="text-muted-fg-faint mt-1 text-xs">강사 사정으로 이 회차를 진행할 수 없을 때, 같은 요일·시간에 가능한 다른 강사로 교체합니다.</p>
                {reassignMatches.length === 0 ? (
                  <p className="text-muted-fg mt-3 text-sm">이 시간에 대체 가능한 강사가 없습니다.</p>
                ) : (
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-muted-fg-faint text-xs font-semibold">대체 강사</span>
                      <select
                        value={newTeacherId}
                        onChange={(e) => setNewTeacherId(e.target.value)}
                        className="border-rule-faint focus:border-accent-blue min-w-[12rem] rounded-md border bg-white px-3 py-1.5 text-sm outline-none"
                      >
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
                      className="bg-cta inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {pending && <Loader2 className="size-3.5 animate-spin" />}
                      강사 대체
                    </button>
                  </div>
                )}
              </section>
                </>
              )}

              {isEnded && (
                <p className="text-muted-fg-faint text-xs">이미 종료된 미진행 수업이라 일정 변경·강사 대체는 할 수 없습니다. (노쇼 사후 처리를 위한 취소만 가능)</p>
              )}

              {/* 수업 취소 */}
              <section className="border-brand/30 rounded-lg border p-4">
                <h3 className="text-brand text-sm font-bold">수업 취소</h3>
                <label className="text-muted-fg mt-3 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={makeup} onChange={(e) => setMakeup(e.target.checked)} className="size-4" />
                  보강 수업 생성 (과정 마지막 수업 다음 빈 날짜)
                </label>
                <button
                  type="button"
                  onClick={() => setCancelOpen(true)}
                  disabled={pending}
                  className="border-brand/40 text-brand hover:bg-brand/5 mt-3 inline-flex h-9 items-center gap-1.5 rounded-md border px-4 text-sm font-bold transition-colors disabled:opacity-50"
                >
                  {pending && <Loader2 className="size-3.5 animate-spin" />}
                  수업 취소
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
            className="border-rule text-muted-fg hover:bg-surface rounded-md border px-4 py-2 text-sm font-bold transition-colors"
          >
            닫기
          </button>
        </div>
      </div>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent className="z-[130]">
          <AlertDialogHeader>
            <AlertDialogTitle>이 수업을 취소할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="text-ink font-semibold">{studentLabel}</span>님의 {row.session_date} {timeRange(row.start_min, row.end_min)} 수업이 취소됩니다.
              {makeup ? " 보강 수업이 자동 생성됩니다." : " 보강은 생성되지 않습니다."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>돌아가기</AlertDialogCancel>
            <AlertDialogAction onClick={doCancel} className="bg-brand hover:bg-brand/90 border-transparent text-white">
              수업 취소
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <AlertDialogContent className="z-[130]">
          <AlertDialogHeader>
            <AlertDialogTitle>일정을 변경할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="text-ink font-semibold">{studentLabel}</span>님의 수업을 {date} {timeRange(startMin, endMin)}로 변경합니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>돌아가기</AlertDialogCancel>
            <AlertDialogAction onClick={doReschedule} className="bg-cta hover:bg-cta/90 border-transparent text-white">
              일정 변경
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
              <span className="text-ink font-semibold">{selectedNewTeacher?.name ?? "선택한 강사"}</span> 강사로 변경합니다. 기존 강사의 강의실에서는 이 수업이 사라집니다.
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
