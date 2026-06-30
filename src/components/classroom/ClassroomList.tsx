"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, Eye, Loader2, MessageSquare, Video, X } from "lucide-react";
import { ko as koLocale, enUS } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fmtTime, DAY_LABELS_KO, lessonEndMin } from "@/lib/availability";
import { canEnterClass, canCancelClass, MAX_CANCELLATIONS } from "@/lib/classtime";
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
import { cancelClass, enterClass, saveClassFeedback } from "@/app/classroom/actions";

export type ClassItem = {
  id: string;
  enrollmentId: string;
  courseTitle: string;
  counterpart: string; // 학생 뷰=강사명, 강사 뷰=학생명
  sessionNo: number;
  sessionDate: string; // YYYY-MM-DD (KST)
  startMin: number;
  endMin: number;
  startMs: number;
  endMs: number;
  status: "예정" | "취소";
  isMakeup: boolean;
  feedback: string | null;
  feedbackAt: string | null;
};

type CourseGroup = {
  enrollmentId: string;
  courseTitle: string;
  counterpart: string;
  items: ClassItem[]; // session_date·start_min asc(서버 정렬 유지)
  cancelledCount: number;
  total: number; // 계획 회차 수(보강 제외 = 원 생성 회차, enrollment.total_sessions와 일치). 회차 라벨 분모.
};

type View = "list" | "calendar";

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]; // index = getDay (0=Sun)

const pad = (n: number) => String(n).padStart(2, "0");
const dateToStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

// sessionDate(YYYY-MM-DD) → 날짜 라벨. ko="7월 1일 (월)" / en="Jul 1 (Mon)".
function formatSessionDate(d: string, ko: boolean): string {
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) return d;
  const dow = new Date(y, m - 1, day).getDay();
  return ko ? `${m}월 ${day}일 (${DAY_LABELS_KO[dow]})` : `${MONTHS_EN[m - 1]} ${day} (${WEEKDAYS_EN[dow]})`;
}

const isActive = (c: ClassItem) => c.status !== "취소";

export default function ClassroomList({ classes, isTeacher }: { classes: ClassItem[]; isTeacher: boolean }) {
  // 강사 화면은 영문, 학생 화면은 한국어.
  const ko = !isTeacher;

  // 1분마다 갱신 — 다음 수업·진행률·입장/취소 버튼 활성·예정/지난 분리를 시간에 맞춰 갱신.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // enrollment_id별 그룹핑(서버 정렬 유지) → 다음 예정 수업 빠른 그룹 먼저, 전부 종료된 그룹은 뒤로.
  const groups: CourseGroup[] = useMemo(() => {
    const map = new Map<string, CourseGroup>();
    for (const c of classes) {
      const g = map.get(c.enrollmentId);
      if (g) g.items.push(c);
      else map.set(c.enrollmentId, { enrollmentId: c.enrollmentId, courseTitle: c.courseTitle, counterpart: c.counterpart, items: [c], cancelledCount: 0, total: 0 });
    }
    const out = Array.from(map.values());
    for (const g of out) {
      g.cancelledCount = g.items.filter((c) => c.status === "취소").length;
      g.total = g.items.filter((c) => !c.isMakeup).length; // 보강 제외 = 계획 회차 수
    }
    const nextStart = (g: CourseGroup) => g.items.find((c) => isActive(c) && c.endMs >= now)?.startMs ?? Infinity;
    return out.sort((a, b) => nextStart(a) - nextStart(b));
  }, [classes, now]);

  if (classes.length === 0) {
    return (
      <section className="border-rule overflow-hidden rounded-2xl border bg-white">
        <div className="px-6 py-12 text-center">
          <p className="text-muted-fg text-sm">
            {ko ? "아직 예정된 수업이 없어요. 결제가 확인되면 수업이 생성돼요." : "No classes scheduled yet."}
          </p>
        </div>
      </section>
    );
  }

  const selected = selectedId ? (groups.find((g) => g.enrollmentId === selectedId) ?? null) : null;

  if (selected) {
    return <CourseDetail group={selected} isTeacher={isTeacher} now={now} ko={ko} onBack={() => setSelectedId(null)} />;
  }

  // 진입 — 과정 카드 그리드.
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {groups.map((g) => (
        <CourseCard key={g.enrollmentId} group={g} isTeacher={isTeacher} now={now} onSelect={() => setSelectedId(g.enrollmentId)} />
      ))}
    </div>
  );
}

// 과정 상세 — 달력 기본 + 목록 토글(해당 과정 수업만).
function CourseDetail({ group, isTeacher, now, ko, onBack }: { group: CourseGroup; isTeacher: boolean; now: number; ko: boolean; onBack: () => void }) {
  const [view, setView] = useState<View>("calendar");
  // 학생만 취소 가능 + 과정당 6회 한도.
  const cancelledCount = group.cancelledCount;
  const cancelAllowed = !isTeacher && cancelledCount < MAX_CANCELLATIONS;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="text-muted-fg hover:text-ink focus-visible:ring-accent-blue/50 inline-flex items-center gap-1 rounded text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
          <ArrowLeft className="size-4" />
          {ko ? "목록으로" : "Back"}
        </button>
        <h2 className="text-ink truncate text-base font-bold">{group.courseTitle}</h2>
        {!isTeacher && (
          <span className="text-muted-fg-faint ml-auto shrink-0 text-xs">
            취소 {group.cancelledCount}/{MAX_CANCELLATIONS}
          </span>
        )}
      </div>

      <ViewToggle view={view} setView={setView} ko={ko} />

      {view === "calendar" ? (
        <ClassroomCalendar classes={group.items} isTeacher={isTeacher} now={now} cancelAllowed={cancelAllowed} cancelledCount={cancelledCount} total={group.total} />
      ) : (
        <SessionList items={group.items} isTeacher={isTeacher} now={now} ko={ko} cancelAllowed={cancelAllowed} cancelledCount={cancelledCount} total={group.total} />
      )}
    </div>
  );
}

function ViewToggle({ view, setView, ko }: { view: View; setView: (v: View) => void; ko: boolean }) {
  const tabs: [View, string][] = [
    ["calendar", ko ? "달력" : "Calendar"],
    ["list", ko ? "목록" : "List"],
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

// 목록 — 예정/지난(+취소) 수업(단일 과정). 예정=활성 미래, 지난=과거 활성 + 취소 전부.
function SessionList({
  items,
  isTeacher,
  now,
  ko,
  cancelAllowed,
  cancelledCount,
  total,
}: {
  items: ClassItem[];
  isTeacher: boolean;
  now: number;
  ko: boolean;
  cancelAllowed: boolean;
  cancelledCount: number;
  total: number;
}) {
  const upcoming = items.filter((c) => isActive(c) && c.endMs >= now);
  const past = items.filter((c) => !(isActive(c) && c.endMs >= now)).reverse();
  return (
    <div className="space-y-5">
      <Section title={ko ? "예정된 수업" : "Upcoming classes"} count={upcoming.length} ko={ko}>
        {upcoming.length === 0 ? (
          <p className="text-muted-fg px-6 py-8 text-center text-sm">{ko ? "예정된 수업이 없어요." : "No upcoming classes."}</p>
        ) : (
          <ul className="list-none">
            {upcoming.map((c) => (
              <ClassRow key={c.id} item={c} isTeacher={isTeacher} now={now} cancelAllowed={cancelAllowed} cancelledCount={cancelledCount} total={total} />
            ))}
          </ul>
        )}
      </Section>

      {past.length > 0 && (
        <Section title={ko ? "지난 수업" : "Past classes"} count={past.length} ko={ko}>
          <ul className="list-none">
            {past.map((c) => (
              <ClassRow key={c.id} item={c} isTeacher={isTeacher} now={now} cancelAllowed={cancelAllowed} cancelledCount={cancelledCount} total={total} isPast />
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

// 달력 — 단일 과정 월간. 예정/지난/취소 색 구분, 날짜 클릭 시 그 날 수업 목록.
function ClassroomCalendar({
  classes,
  isTeacher,
  now,
  cancelAllowed,
  cancelledCount,
  total,
}: {
  classes: ClassItem[];
  isTeacher: boolean;
  now: number;
  cancelAllowed: boolean;
  cancelledCount: number;
  total: number;
}) {
  const ko = !isTeacher;

  // 기본 포커스 = 다음 예정 수업(없으면 마지막 수업) 날짜. 1회만 계산(틱에 튀지 않게).
  const [selected, setSelected] = useState<Date | undefined>(() => {
    const t = Date.now();
    const src = classes.find((c) => isActive(c) && c.endMs >= t) ?? classes[classes.length - 1];
    return src ? parseDate(src.sessionDate) : new Date();
  });

  const { byDate, upcoming, past, cancelled } = useMemo(() => {
    const byDate = new Map<string, ClassItem[]>();
    for (const c of classes) {
      const arr = byDate.get(c.sessionDate) ?? [];
      arr.push(c);
      byDate.set(c.sessionDate, arr);
    }
    const upcoming: Date[] = [];
    const past: Date[] = [];
    const cancelled: Date[] = [];
    for (const [ds, dItems] of Array.from(byDate.entries())) {
      const date = parseDate(ds);
      if (dItems.some((c) => isActive(c) && c.endMs >= now)) upcoming.push(date);
      else if (dItems.some((c) => isActive(c))) past.push(date);
      else cancelled.push(date);
    }
    return { byDate, upcoming, past, cancelled };
  }, [classes, now]);

  const selectedStr = selected ? dateToStr(selected) : "";
  const dayItems = (byDate.get(selectedStr) ?? []).slice().sort((a, b) => a.startMin - b.startMin);

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <div className="border-rule rounded-xl border bg-white p-3">
          <Calendar
            mode="single"
            required
            selected={selected}
            onSelect={setSelected}
            defaultMonth={selected}
            locale={ko ? koLocale : enUS}
            weekStartsOn={0}
            showOutsideDays={false}
            formatters={{ formatWeekdayName: (d: Date) => d.toLocaleDateString(ko ? "ko-KR" : "en-US", { weekday: "short" }) }}
            modifiers={{ upcoming, past, cancelled, sunday: { dayOfWeek: [0] }, saturday: { dayOfWeek: [6] } }}
            modifiersClassNames={{
              upcoming: "bg-accent-blue/10 text-accent-blue-ink font-bold rounded-(--cell-radius)",
              past: "bg-rule/60 text-muted-fg rounded-(--cell-radius)",
              cancelled: "text-muted-fg-faint line-through",
              sunday: "!text-brand",
              saturday: "!text-accent-blue-ink",
            }}
            classNames={{
              today: "bg-[#FFF3CD] text-ink font-bold ring-1 ring-[#F5A623] ring-inset rounded-(--cell-radius) !opacity-100",
            }}
            className="text-base [--cell-size:--spacing(10)] [&_.rdp-weekday:first-child]:!text-brand [&_.rdp-weekday:last-child]:!text-accent-blue-ink"
          />
        </div>
      </div>

      <Section title={selectedStr ? formatSessionDate(selectedStr, ko) : ""} count={dayItems.length} ko={ko}>
        {dayItems.length === 0 ? (
          <p className="text-muted-fg px-6 py-8 text-center text-sm">{ko ? "이 날은 수업이 없어요." : "No classes on this day."}</p>
        ) : (
          <ul className="list-none">
            {dayItems.map((c) => (
              <ClassRow key={c.id} item={c} isTeacher={isTeacher} now={now} cancelAllowed={cancelAllowed} cancelledCount={cancelledCount} total={total} isPast={c.endMs < now} />
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function CourseCard({ group, isTeacher, now, onSelect }: { group: CourseGroup; isTeacher: boolean; now: number; onSelect: () => void }) {
  const ko = !isTeacher;
  const active = group.items.filter(isActive);
  const total = active.length;
  const done = active.filter((c) => c.endMs < now).length;
  const next = active.find((c) => c.endMs >= now);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="border-rule hover:border-accent-blue/50 focus-visible:ring-accent-blue/50 flex flex-col rounded-2xl border bg-white p-5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-ink truncate text-[15px] font-bold">{group.courseTitle}</p>
          <p className="text-muted-fg mt-0.5 truncate text-sm">
            {isTeacher ? "Student" : "강사"} {group.counterpart}
          </p>
        </div>
        <ChevronRight aria-hidden className="text-muted-fg-faint mt-0.5 size-5 shrink-0" />
      </div>

      <p className="text-muted-fg mt-3 text-sm">
        {next
          ? `${ko ? "다음" : "Next"} ${formatSessionDate(next.sessionDate, ko)} ${fmtTime(next.startMin)}`
          : ko
            ? "수업 종료"
            : "Completed"}
      </p>

      <div className="mt-3">
        <div className="bg-rule h-1.5 w-full overflow-hidden rounded-full">
          <div className="bg-brand-gradient h-full rounded-full" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-muted-fg-faint mt-1.5 text-xs">
          {ko ? `${total}회 중 ${done}회 완료` : `${done}/${total} sessions`}
        </p>
      </div>
    </button>
  );
}

function Section({ title, count, ko, children }: { title: string; count: number; ko: boolean; children: React.ReactNode }) {
  return (
    <section className="border-rule overflow-hidden rounded-2xl border bg-white">
      <div className="border-rule flex items-center gap-2 border-b px-6 py-5">
        <span aria-hidden>🎬</span>
        <h2 className="text-ink text-base font-bold">{title}</h2>
        <span className="text-muted-fg-faint ml-auto text-sm">
          {count}
          {ko ? "개" : ""}
        </span>
      </div>
      {children}
    </section>
  );
}

function ClassRow({
  item,
  isTeacher,
  now,
  isPast = false,
  cancelAllowed,
  cancelledCount,
  total,
}: {
  item: ClassItem;
  isTeacher: boolean;
  now: number;
  isPast?: boolean;
  cancelAllowed: boolean;
  cancelledCount: number;
  total: number;
}) {
  const ko = !isTeacher;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const cancelled = item.status === "취소";
  const enterable = !cancelled && !isPast && canEnterClass(now, item.startMs, item.endMs);
  const cancellable = cancelAllowed && !cancelled && !isPast && canCancelClass(now, item.startMs);
  const timeRange = `${fmtTime(item.startMin)}~${fmtTime(lessonEndMin(item.endMin))}`;
  // 수업 종료(레슨 종료 시각 이후) — 강사 피드백 작성 가능 조건.
  const ended = !cancelled && now >= item.endMs;
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  function handleEnter() {
    // 팝업 차단 회피 — 동기적으로 빈 탭을 먼저 연 뒤 액션 결과 URL로 이동.
    const w = window.open("", "_blank");
    startTransition(async () => {
      const res = await enterClass(item.id);
      if (res.url) {
        if (w) w.location.href = res.url;
        else window.open(res.url, "_blank");
      } else {
        w?.close();
        toast.error(res.error ?? (ko ? "입장할 수 없어요." : "Unable to enter the class."));
      }
    });
  }

  function handleCancel() {
    setConfirmOpen(false);
    startTransition(async () => {
      const res = await cancelClass(item.id);
      if (res.ok) {
        const label = res.makeupDate ? formatSessionDate(res.makeupDate, true) : "";
        const remainingText = typeof res.remaining === "number" ? ` (남은 취소 ${res.remaining}회)` : "";
        toast.success((res.makeupDate ? `수업을 취소했어요. 보강이 ${label}로 잡혔어요.` : "수업을 취소했어요.") + remainingText);
        router.refresh();
      } else {
        toast.error(res.error ?? "취소할 수 없어요.");
      }
    });
  }

  return (
    <li className="border-rule flex flex-col gap-3 border-b px-6 py-4 last:border-b-0">
      <div className={cn("flex items-center gap-3", (isPast || cancelled) && "opacity-60")}>
        <div className="min-w-0 flex-1">
        <p className={cn("text-ink truncate text-[15px] font-bold", cancelled && "line-through")}>
          {formatSessionDate(item.sessionDate, ko)} · {timeRange}
        </p>
        <p className="text-muted-fg-faint mt-0.5 flex items-center gap-1.5 text-xs">
          <span>{ko ? `${item.sessionNo}/${total}회차` : `Session ${item.sessionNo}/${total}`}</span>
          {cancelled && <span className="bg-brand/10 text-brand rounded-full px-2 py-0.5 font-bold">{ko ? "취소" : "Cancelled"}</span>}
          {item.isMakeup && !cancelled && (
            <span className="bg-accent-blue-soft text-accent-blue-ink rounded-full px-2 py-0.5 font-bold">{ko ? "보강" : "Makeup"}</span>
          )}
        </p>
      </div>

      {enterable ? (
        <button
          type="button"
          onClick={handleEnter}
          disabled={pending}
          className="bg-cta inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50">
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Video className="size-3.5" />}
          {ko ? "입장하기" : "Enter"}
        </button>
      ) : cancellable ? (
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={pending}
          className="border-brand/40 text-brand hover:bg-brand/5 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-4 text-sm font-bold transition-colors disabled:opacity-50">
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
          {ko ? "취소" : "Cancel"}
        </button>
      ) : !cancelled && !isPast ? (
        <span className="text-muted-fg-faint shrink-0 text-xs">{ko ? "시작 15분 전 입장" : "Opens 15 min before"}</span>
      ) : null}
      </div>

      {/* 수업 종료 후 강사 피드백 — 행에는 버튼만, 내용/편집은 모달에서(긴 피드백 UX). */}
      {isTeacher && ended ? (
        <button
          type="button"
          onClick={() => setFeedbackOpen(true)}
          className="border-rule text-ink hover:bg-rule/40 inline-flex h-9 w-fit items-center gap-1.5 rounded-md border px-4 text-sm font-bold transition-colors">
          <MessageSquare className="size-3.5" /> {item.feedback ? "Edit feedback" : "Write feedback"}
        </button>
      ) : !isTeacher && item.feedback ? (
        <button
          type="button"
          onClick={() => setFeedbackOpen(true)}
          className="border-rule text-accent-blue-ink hover:bg-accent-blue-soft/40 inline-flex h-9 w-fit items-center gap-1.5 rounded-md border px-4 text-sm font-bold transition-colors">
          <Eye className="size-3.5" /> 피드백 보기
        </button>
      ) : null}

      {feedbackOpen && <ClassFeedbackModal item={item} isTeacher={isTeacher} onClose={() => setFeedbackOpen(false)} />}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>수업을 취소할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="text-ink font-semibold">
                {formatSessionDate(item.sessionDate, true)} {timeRange}
              </span>{" "}
              수업이 취소되고, 보강이 자동 배정돼요. 이번에 취소하면{" "}
              <span className="text-brand font-semibold">{Math.max(0, MAX_CANCELLATIONS - cancelledCount - 1)}회</span> 남습니다. (과정당 {MAX_CANCELLATIONS}
              회까지)
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>돌아가기</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} className="bg-brand hover:bg-brand/90 border-transparent text-white">
              수업 취소
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

// 수업 피드백 모달 — 강사=보기+작성/수정, 수강생=읽기 전용. 행에는 버튼만 두고 내용/편집은 여기서(긴 피드백 UX).
function ClassFeedbackModal({ item, isTeacher, onClose }: { item: ClassItem; isTeacher: boolean; onClose: () => void }) {
  const ko = !isTeacher;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(item.feedback ?? "");
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

  function handleSave() {
    startTransition(async () => {
      const res = await saveClassFeedback(item.id, draft);
      if (res.ok) {
        toast.success(ko ? "피드백을 저장했어요." : "Feedback saved.");
        router.refresh();
        onClose();
      } else {
        toast.error(res.error ?? (ko ? "저장할 수 없어요." : "Unable to save feedback."));
      }
    });
  }

  const subtitle = `${formatSessionDate(item.sessionDate, ko)} · ${ko ? `${item.sessionNo}회차` : `Session ${item.sessionNo}`}`;

  return (
    <>
      <div aria-hidden="true" onClick={onClose} className="fixed inset-0 z-[110] bg-black/40" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={ko ? "강사 피드백" : "Class feedback"}
        className="fixed top-1/2 left-1/2 z-[120] flex max-h-[90vh] w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="border-rule flex items-center justify-between gap-3 border-b px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-ink truncate text-lg font-bold">{ko ? "강사 피드백" : "Class feedback"}</h2>
            <p className="text-muted-fg-faint mt-0.5 truncate text-xs">{subtitle}</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={ko ? "닫기" : "Close"}
            className="text-muted-fg-faint hover:text-ink focus-visible:ring-accent-blue/50 ml-1 shrink-0 rounded transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
            <X className="size-5" />
          </button>
        </div>

        <div className="overflow-auto px-6 py-5">
          {isTeacher ? (
            <>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={2000}
                rows={8}
                placeholder="Write feedback for this class…"
                className="border-rule focus:border-accent-blue-ink w-full resize-y rounded-md border bg-white px-3 py-2 text-sm outline-none" />
              <p className="text-muted-fg-faint mt-1 text-right text-xs">{draft.length}/2000</p>
            </>
          ) : (
            <>
              {item.feedbackAt && <p className="text-muted-fg-faint mb-2 text-xs">{new Date(item.feedbackAt).toLocaleDateString("ko-KR")}</p>}
              <p className="text-ink-soft text-sm break-words whitespace-pre-wrap">{item.feedback}</p>
            </>
          )}
        </div>

        <div className="border-rule flex justify-end gap-2 border-t px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="border-rule text-muted-fg hover:bg-surface rounded-md border px-4 py-2 text-sm font-bold transition-colors disabled:opacity-50">
            {ko ? "닫기" : isTeacher ? "Cancel" : "Close"}
          </button>
          {isTeacher && (
            <button
              type="button"
              onClick={handleSave}
              disabled={pending}
              className="bg-cta inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50">
              {pending && <Loader2 className="size-3.5 animate-spin" />}
              Save
            </button>
          )}
        </div>
      </div>
    </>
  );
}
