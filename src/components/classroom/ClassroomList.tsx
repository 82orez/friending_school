"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Circle, Eye, Loader2, MessageSquare, Triangle, Video, X } from "lucide-react";
import { ko as koLocale, enUS } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fmtTime, DAY_LABELS, DAY_LABELS_KO, DISPLAY_DAYS, ROW_MINS, GRID_START_HOUR, SLOT_MIN, lessonEndMin } from "@/lib/availability";
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
  cancelReason: string | null; // 'student' 연기(차감) · 'company' 회사 연기 · 'cancel' 취소(보강 없음)
  feedback: string | null;
  feedbackAt: string | null;
  teacherEnteredAt: string | null;
  conductedAt: string | null;
  conductedOverride: boolean | null; // admin 수동 보정 — null=자동, true=강제 진행됨, false=강제 미진행
  reassignedAt: string | null; // 강사 대체 시각 — 학생 예정 수업에 "강사 변경" 표시용
};

// 강사 수업 진행 표시 — conducted=○(진행 인정), pending=△(입장했으나 피드백 전, 종료된 수업만). 취소·미입장은 null.
// 유효 진행여부 = conductedOverride ?? (conductedAt!=null) — admin 수동 보정이 자동 판정을 덮는다.
type ConductMark = "conducted" | "pending" | null;
function conductMark(c: ClassItem, now: number): ConductMark {
  if (c.status === "취소") return null;
  const effective = c.conductedOverride ?? !!c.conductedAt;
  if (effective) return "conducted"; // ○ (override=true 포함)
  if (c.conductedOverride === false) return null; // admin이 미진행 확정 → 마커 없음(△도 아님)
  if (c.teacherEnteredAt && now >= c.endMs) return "pending";
  return null;
}

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

// 해당 날짜가 속한 주의 월요일(로컬 기준, 자정). getDay 0=일 → 6일 전이 월요일.
function mondayOf(d: Date): Date {
  const base = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = base.getDay(); // 0=일 ~ 6=토
  const diff = dow === 0 ? -6 : 1 - dow; // 월요일까지의 오프셋
  base.setDate(base.getDate() + diff);
  return base;
}

const addDays = (d: Date, n: number) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
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
  const [landingView, setLandingView] = useState<"cards" | "weekly">("cards");

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
      // '남은 연기' 차감은 학생 연기(cancel_reason='student')만 — 회사 사유 연기·취소는 미차감.
      g.cancelledCount = g.items.filter((c) => c.status === "취소" && c.cancelReason === "student").length;
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

  // 진입 — 뷰 토글(카드 / 주간) + 선택 뷰.
  const landingTabs: [typeof landingView, string][] = [
    ["cards", ko ? "과정별" : "Cards"],
    ["weekly", ko ? "주간" : "Weekly"],
  ];
  return (
    <div className="space-y-5">
      <div className="bg-surface inline-flex rounded-lg p-1">
        {landingTabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={landingView === key}
            onClick={() => setLandingView(key)}
            className={cn(
              "focus-visible:ring-accent-blue/50 rounded-md px-4 py-1.5 text-sm font-bold transition-colors focus-visible:ring-2 focus-visible:outline-none",
              landingView === key ? "text-ink bg-white shadow-sm" : "text-muted-fg",
            )}>
            {label}
          </button>
        ))}
      </div>

      {landingView === "weekly" ? (
        <WeekSchedule classes={classes} isTeacher={isTeacher} now={now} ko={ko} onSelectCourse={setSelectedId} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {groups.map((g) => (
            <CourseCard key={g.enrollmentId} group={g} isTeacher={isTeacher} now={now} onSelect={() => setSelectedId(g.enrollmentId)} />
          ))}
        </div>
      )}
    </div>
  );
}

// 과정 상세 — 달력 기본 + 목록 토글(해당 과정 수업만).
function CourseDetail({ group, isTeacher, now, ko, onBack }: { group: CourseGroup; isTeacher: boolean; now: number; ko: boolean; onBack: () => void }) {
  const [view, setView] = useState<View>("calendar");
  // 학생만 취소 가능 + 과정당 6회 한도.
  const cancelledCount = group.cancelledCount;
  const cancelAllowed = !isTeacher && cancelledCount < MAX_CANCELLATIONS;
  // 다음(가장 이른) 예정 수업 1건만 취소 가능 — 서버 cancelClass 가드와 동일 정의(미취소·미시작 중 최소 시작시각).
  // 단, 진행 중(입장 가능 창)인 수업이 있으면 다음 수업 연기 버튼을 숨긴다.
  const nextUpcomingId = useMemo(() => {
    const inProgress = group.items.some((it) => it.status !== "취소" && canEnterClass(now, it.startMs, it.endMs));
    if (inProgress) return null;
    const up = group.items.filter((it) => it.status !== "취소" && it.startMs > now).sort((a, b) => a.startMs - b.startMs);
    return up[0]?.id ?? null;
  }, [group.items, now]);

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
            연기 {group.cancelledCount}/{MAX_CANCELLATIONS}
          </span>
        )}
      </div>

      <ViewToggle view={view} setView={setView} ko={ko} />

      {view === "calendar" ? (
        <ClassroomCalendar
          classes={group.items}
          isTeacher={isTeacher}
          now={now}
          cancelAllowed={cancelAllowed}
          cancelledCount={cancelledCount}
          total={group.total}
          nextUpcomingId={nextUpcomingId}
        />
      ) : (
        <SessionList
          items={group.items}
          isTeacher={isTeacher}
          now={now}
          ko={ko}
          cancelAllowed={cancelAllowed}
          cancelledCount={cancelledCount}
          total={group.total}
          nextUpcomingId={nextUpcomingId}
        />
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
  nextUpcomingId,
}: {
  items: ClassItem[];
  isTeacher: boolean;
  now: number;
  ko: boolean;
  cancelAllowed: boolean;
  cancelledCount: number;
  total: number;
  nextUpcomingId: string | null;
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
              <ClassRow
                key={c.id}
                item={c}
                isTeacher={isTeacher}
                now={now}
                cancelAllowed={cancelAllowed}
                cancelledCount={cancelledCount}
                total={total}
                nextUpcomingId={nextUpcomingId}
              />
            ))}
          </ul>
        )}
      </Section>

      {past.length > 0 && (
        <Section title={ko ? "지난 수업" : "Past classes"} count={past.length} ko={ko}>
          <ul className="list-none">
            {past.map((c) => (
              <ClassRow
                key={c.id}
                item={c}
                isTeacher={isTeacher}
                now={now}
                cancelAllowed={cancelAllowed}
                cancelledCount={cancelledCount}
                total={total}
                nextUpcomingId={nextUpcomingId}
                isPast
              />
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
  nextUpcomingId,
}: {
  classes: ClassItem[];
  isTeacher: boolean;
  now: number;
  cancelAllowed: boolean;
  cancelledCount: number;
  total: number;
  nextUpcomingId: string | null;
}) {
  const ko = !isTeacher;

  // 기본 포커스 = 다음 예정 수업(없으면 마지막 수업) 날짜. 1회만 계산(틱에 튀지 않게).
  const [selected, setSelected] = useState<Date | undefined>(() => {
    const t = Date.now();
    const src = classes.find((c) => isActive(c) && c.endMs >= t) ?? classes[classes.length - 1];
    return src ? parseDate(src.sessionDate) : new Date();
  });

  const { byDate, upcoming, past, cancelled, conducted, pending } = useMemo(() => {
    const byDate = new Map<string, ClassItem[]>();
    for (const c of classes) {
      const arr = byDate.get(c.sessionDate) ?? [];
      arr.push(c);
      byDate.set(c.sessionDate, arr);
    }
    const upcoming: Date[] = [];
    const past: Date[] = [];
    const cancelled: Date[] = [];
    const conducted: Date[] = []; // 강사 ○ 진행 인정
    const pending: Date[] = []; // 강사 △ 입장했으나 피드백 전
    for (const [ds, dItems] of Array.from(byDate.entries())) {
      const date = parseDate(ds);
      if (dItems.some((c) => isActive(c) && c.endMs >= now)) upcoming.push(date);
      else if (dItems.some((c) => isActive(c))) past.push(date);
      else cancelled.push(date);
      // 강사 진행 마커 — 한 날짜에 여러 수업이면 conducted 우선.
      if (isTeacher) {
        const marks = dItems.map((c) => conductMark(c, now));
        if (marks.includes("conducted")) conducted.push(date);
        else if (marks.includes("pending")) pending.push(date);
      }
    }
    return { byDate, upcoming, past, cancelled, conducted, pending };
  }, [classes, now, isTeacher]);

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
            modifiers={{ upcoming, past, cancelled, conducted, pending, sunday: { dayOfWeek: [0] }, saturday: { dayOfWeek: [6] } }}
            modifiersClassNames={{
              upcoming: "bg-accent-blue/10 text-accent-blue-ink font-bold rounded-(--cell-radius)",
              past: "bg-rule/60 text-muted-fg rounded-(--cell-radius)",
              cancelled: "text-muted-fg-faint line-through",
              conducted: "after:content-['●'] after:absolute after:top-0.5 after:right-1 after:text-[10px] after:leading-none after:text-cta",
              pending: "after:content-['▲'] after:absolute after:top-0.5 after:right-1 after:text-[10px] after:leading-none after:text-[#F5A623]",
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

      {isTeacher && (
        <p className="text-muted-fg-faint flex items-center justify-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1">
            <span className="text-cta">●</span> Conducted
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="text-[#F5A623]">▲</span> Feedback pending
          </span>
        </p>
      )}

      <Section title={selectedStr ? formatSessionDate(selectedStr, ko) : ""} count={dayItems.length} ko={ko}>
        {dayItems.length === 0 ? (
          <p className="text-muted-fg px-6 py-8 text-center text-sm">{ko ? "이 날은 수업이 없어요." : "No classes on this day."}</p>
        ) : (
          <ul className="list-none">
            {dayItems.map((c) => (
              <ClassRow
                key={c.id}
                item={c}
                isTeacher={isTeacher}
                now={now}
                cancelAllowed={cancelAllowed}
                cancelledCount={cancelledCount}
                total={total}
                nextUpcomingId={nextUpcomingId}
                isPast={c.endMs < now}
              />
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
  nextUpcomingId,
}: {
  item: ClassItem;
  isTeacher: boolean;
  now: number;
  isPast?: boolean;
  cancelAllowed: boolean;
  cancelledCount: number;
  total: number;
  nextUpcomingId: string | null;
}) {
  const ko = !isTeacher;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const cancelled = item.status === "취소";
  const enterable = !cancelled && !isPast && canEnterClass(now, item.startMs, item.endMs);
  // enterable이 아닐 때만 로컬 pending을 취소 전이에 쓴다(입장은 EnterClassButton이 자체 pending 소유).
  // 다음(가장 이른) 예정 수업 1건만 취소 가능(서버 cancelClass 가드와 동일).
  const cancellable = cancelAllowed && !cancelled && !isPast && item.id === nextUpcomingId && canCancelClass(now, item.startMs);
  const timeRange = `${fmtTime(item.startMin)}~${fmtTime(lessonEndMin(item.endMin))}`;
  // 수업 종료(레슨 종료 시각 이후) — 강사 피드백 작성 가능 조건.
  const ended = !cancelled && now >= item.endMs;
  // 강사 대체 표시 — 학생 뷰의 예정(미취소·미종료) 수업만.
  const reassigned = !isTeacher && !!item.reassignedAt && !cancelled && !isPast;
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  function handleCancel() {
    setConfirmOpen(false);
    startTransition(async () => {
      const res = await cancelClass(item.id);
      if (res.ok) {
        const label = res.makeupDate ? formatSessionDate(res.makeupDate, true) : "";
        const remainingText = typeof res.remaining === "number" ? ` (남은 연기 ${res.remaining}회)` : "";
        toast.success((res.makeupDate ? `수업을 연기했어요. 보강이 ${label}로 잡혔어요.` : "수업을 연기했어요.") + remainingText);
        router.refresh();
      } else {
        toast.error(res.error ?? "연기할 수 없어요.");
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
          {cancelled &&
            (item.cancelReason === "cancel" ? (
              <span className="bg-brand/10 text-brand rounded-full px-2 py-0.5 font-bold">{ko ? "취소" : "Cancelled"}</span>
            ) : (
              <span className="bg-brand/10 text-brand rounded-full px-2 py-0.5 font-bold">{ko ? "연기" : "Postponed"}</span>
            ))}
          {item.isMakeup && !cancelled && (
            <span className="bg-accent-blue-soft text-accent-blue-ink rounded-full px-2 py-0.5 font-bold">{ko ? "보강" : "Makeup"}</span>
          )}
          {reassigned && <span className="bg-cta/10 text-cta rounded-full px-2 py-0.5 font-bold">강사 변경</span>}
          {isTeacher &&
            (() => {
              const mark = conductMark(item, now);
              if (mark === "conducted")
                return (
                  <span className="bg-cta/10 text-cta inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold">
                    <Circle className="size-3 fill-current" aria-hidden /> Conducted
                  </span>
                );
              if (mark === "pending")
                return (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF7E6] px-2 py-0.5 font-bold text-[#B97400]">
                    <Triangle className="size-3 fill-current" aria-hidden /> Feedback pending
                  </span>
                );
              return null;
            })()}
        </p>
        {reassigned && <p className="text-cta mt-1 text-xs font-semibold">담당 강사가 {item.counterpart} 강사로 변경되었어요.</p>}
      </div>

      {enterable ? (
        <EnterClassButton item={item} ko={ko} />
      ) : cancellable ? (
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={pending}
          className="border-brand/40 text-brand hover:bg-brand/5 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-4 text-sm font-bold transition-colors disabled:opacity-50">
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
          {ko ? "수업 연기" : "Postpone"}
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
            <AlertDialogTitle>이 수업을 연기할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="text-ink font-semibold">
                {formatSessionDate(item.sessionDate, true)} {timeRange}
              </span>{" "}
              수업이 연기되고, 보강이 자동 배정돼요. 이번에 연기하면{" "}
              <span className="text-brand font-semibold">{Math.max(0, MAX_CANCELLATIONS - cancelledCount - 1)}회</span> 남습니다. (과정당 {MAX_CANCELLATIONS}
              회까지)
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>돌아가기</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} className="bg-brand hover:bg-brand/90 border-transparent text-white">
              수업 연기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

// 입장 버튼 — 팝업 차단 회피(빈 탭 먼저 열고 액션 URL로 이동). ClassRow·주간 아젠다 공용.
function EnterClassButton({ item, ko, compact = false }: { item: ClassItem; ko: boolean; compact?: boolean }) {
  const [pending, startTransition] = useTransition();
  function handleEnter() {
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
  return (
    <button
      type="button"
      onClick={handleEnter}
      disabled={pending}
      className={cn(
        "bg-cta inline-flex shrink-0 items-center gap-1.5 rounded-md font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50",
        compact ? "h-8 px-3 text-xs" : "h-9 px-4 text-sm",
      )}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Video className="size-3.5" />}
      {ko ? "입장하기" : "Enter"}
    </button>
  );
}

const ROW_H = 48; // 30분 슬롯 셀 높이(px). 한 수업=한 슬롯이라, 블록 3줄(시각/과정/학생)이 들어갈 높이 확보.
const DAY_LABELS_KO_MON = DISPLAY_DAYS.map((d) => DAY_LABELS_KO[d]); // 월~일 순 한국어 요일(그리드 헤더용).

// 주간 그리드 수강건별 배경색 팔레트 — enrollment마다 고유 색. 완전한 리터럴 문자열(JIT 스캔 대상).
const COURSE_PALETTE = [
  { grid: "bg-sky-100 text-sky-800", dot: "bg-sky-400" },
  { grid: "bg-violet-100 text-violet-800", dot: "bg-violet-400" },
  { grid: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-400" },
  { grid: "bg-amber-100 text-amber-900", dot: "bg-amber-400" },
  { grid: "bg-rose-100 text-rose-800", dot: "bg-rose-400" },
  { grid: "bg-teal-100 text-teal-800", dot: "bg-teal-400" },
  { grid: "bg-indigo-100 text-indigo-800", dot: "bg-indigo-400" },
  { grid: "bg-fuchsia-100 text-fuchsia-800", dot: "bg-fuchsia-400" },
];

// 주간 스케줄 — 전체 과정·학생 통합. 데스크톱=월~일 타임그리드, 모바일=요일별 아젠다. 주 이동 지원.
function WeekSchedule({
  classes,
  isTeacher,
  now,
  ko,
  onSelectCourse,
}: {
  classes: ClassItem[];
  isTeacher: boolean;
  now: number;
  ko: boolean;
  onSelectCourse: (enrollmentId: string) => void;
}) {
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date(now)));
  const thisMonday = mondayOf(new Date(now));
  const isThisWeek = weekStart.getTime() === thisMonday.getTime();

  // 수강건(enrollment)별 색 인덱스 — 전체 classes 기준으로 고정(주 이동해도 색 불변).
  const colorIndex = useMemo(() => {
    const ids = Array.from(new Set(classes.map((c) => c.enrollmentId))).sort();
    const m = new Map<string, number>();
    ids.forEach((id, i) => m.set(id, i % COURSE_PALETTE.length));
    return m;
  }, [classes]);

  // 주 7일 + 요일별 수업 그룹(월~일). DISPLAY_DAYS 순서(월 시작).
  const { days, byDay } = useMemo(() => {
    const days = DISPLAY_DAYS.map((_, i) => addDays(weekStart, i)); // 월..일
    const startMs = weekStart.getTime();
    const endMs = addDays(weekStart, 7).getTime();
    const byDay = new Map<number, ClassItem[]>(); // key = DISPLAY_DAYS index(0=월..6=일)
    for (const c of classes) {
      const t = parseDate(c.sessionDate).getTime();
      if (t < startMs || t >= endMs) continue;
      const idx = DISPLAY_DAYS.indexOf(parseDate(c.sessionDate).getDay());
      if (idx < 0) continue;
      const arr = byDay.get(idx) ?? [];
      arr.push(c);
      byDay.set(idx, arr);
    }
    for (const arr of Array.from(byDay.values())) arr.sort((a, b) => a.startMin - b.startMin);
    return { days, byDay };
  }, [classes, weekStart]);

  const weekLabel = ko
    ? `${weekStart.getMonth() + 1}월 ${weekStart.getDate()}일 – ${addDays(weekStart, 6).getMonth() + 1}월 ${addDays(weekStart, 6).getDate()}일`
    : `${MONTHS_EN[weekStart.getMonth()]} ${weekStart.getDate()} – ${MONTHS_EN[addDays(weekStart, 6).getMonth()]} ${addDays(weekStart, 6).getDate()}`;

  const hasAny = Array.from(byDay.values()).some((a) => a.length > 0);
  const gridBottom = GRID_START_HOUR * 60; // 06:00 기준 분

  return (
    <div className="space-y-4">
      {/* 주 이동 */}
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => setWeekStart((w) => addDays(w, -7))}
          aria-label={ko ? "이전 주" : "Previous week"}
          className="text-muted-fg hover:text-ink border-rule focus-visible:ring-accent-blue/50 inline-flex size-8 items-center justify-center rounded-md border transition-colors focus-visible:ring-2 focus-visible:outline-none">
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-ink min-w-[11rem] text-center text-sm font-bold">{weekLabel}</span>
        <button
          type="button"
          onClick={() => setWeekStart((w) => addDays(w, 7))}
          aria-label={ko ? "다음 주" : "Next week"}
          className="text-muted-fg hover:text-ink border-rule focus-visible:ring-accent-blue/50 inline-flex size-8 items-center justify-center rounded-md border transition-colors focus-visible:ring-2 focus-visible:outline-none">
          <ChevronRight className="size-4" />
        </button>
        {!isThisWeek && (
          <button
            type="button"
            onClick={() => setWeekStart(mondayOf(new Date(now)))}
            className="text-accent-blue-ink hover:bg-accent-blue-soft/40 border-accent-blue/40 focus-visible:ring-accent-blue/50 ml-1 inline-flex h-8 items-center rounded-md border px-3 text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:outline-none">
            {ko ? "이번 주" : "This week"}
          </button>
        )}
      </div>

      {/* 데스크톱 타임그리드 */}
      <div className="border-rule hidden rounded-xl border bg-white md:block">
        <div className="max-h-[65vh] overflow-auto">
          <div className="min-w-[640px]">
            {/* 요일 헤더 */}
            <div className="border-rule sticky top-0 z-20 flex border-b bg-white">
              <div className="sticky left-0 z-10 w-14 shrink-0 bg-white" />
              {days.map((d, i) => {
                const today = dateToStr(d) === dateToStr(new Date(now));
                return (
                  <div key={i} className="flex-1 py-1.5 text-center">
                    <div className={cn("text-xs font-bold", today ? "text-accent-blue-ink" : "text-muted-fg")}>{(ko ? DAY_LABELS_KO_MON : DAY_LABELS)[i]}</div>
                    <div className={cn("text-[11px]", today ? "text-accent-blue-ink font-bold" : "text-muted-fg-faint")}>
                      {d.getMonth() + 1}/{d.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* 시간 격자 + 수업 블록 */}
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
              {/* 요일 컬럼 */}
              {days.map((_, i) => {
                const items = byDay.get(i) ?? [];
                return (
                  <div key={i} className="border-rule-faint relative flex-1 border-l first:border-l-0" style={{ height: ROW_MINS.length * ROW_H }}>
                    {/* 배경 시간선 */}
                    {ROW_MINS.map((min) => (
                      <div
                        key={min}
                        className={cn("border-t", min % 60 === 0 ? "border-muted-fg-faint border-t-2" : "border-rule-faint border-dotted")}
                        style={{ height: ROW_H }}
                      />
                    ))}
                    {/* 수업 블록 */}
                    {items.map((c) => {
                      // 상하 각 2px 여백(좌우 inset-x-0.5와 대칭) — 정시 구분선을 블록이 덮지 않게.
                      const top = Math.max(0, ((c.startMin - gridBottom) / SLOT_MIN) * ROW_H) + 2;
                      const height = Math.max(ROW_H - 4, ((c.endMin - c.startMin) / SLOT_MIN) * ROW_H - 4);
                      const cancelled = c.status === "취소";
                      const live = !cancelled && canEnterClass(now, c.startMs, c.endMs);
                      const color = COURSE_PALETTE[colorIndex.get(c.enrollmentId) ?? 0];
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => onSelectCourse(c.enrollmentId)}
                          title={`${c.courseTitle} · ${c.counterpart}`}
                          className={cn(
                            "absolute inset-x-0.5 overflow-hidden rounded-md px-1.5 py-0.5 text-left text-[11px] leading-[1.15] transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none",
                            cancelled ? "bg-rule/60 text-muted-fg line-through" : cn(color.grid, live && "ring-2 ring-cta"),
                          )}
                          style={{ top, height }}>
                          <span className="block font-bold">{fmtTime(c.startMin)}</span>
                          <span className="block truncate">{c.courseTitle}</span>
                          <span className="block truncate opacity-80">{c.counterpart}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 모바일 아젠다 — 수업 있는 날만 */}
      <div className="space-y-4 md:hidden">
        {!hasAny ? (
          <p className="text-muted-fg border-rule rounded-2xl border bg-white px-6 py-10 text-center text-sm">
            {ko ? "이 주에는 수업이 없어요." : "No classes this week."}
          </p>
        ) : (
          days.map((d, i) => {
            const items = byDay.get(i) ?? [];
            if (items.length === 0) return null;
            return (
              <section key={i} className="border-rule overflow-hidden rounded-2xl border bg-white">
                <div className="border-rule flex items-center gap-2 border-b px-5 py-3">
                  <h3 className="text-ink text-sm font-bold">{formatSessionDate(dateToStr(d), ko)}</h3>
                  <span className="text-muted-fg-faint ml-auto text-xs">
                    {items.length}
                    {ko ? "개" : ""}
                  </span>
                </div>
                <ul className="list-none">
                  {items.map((c) => (
                    <WeekAgendaRow
                      key={c.id}
                      item={c}
                      isTeacher={isTeacher}
                      now={now}
                      ko={ko}
                      dotClass={COURSE_PALETTE[colorIndex.get(c.enrollmentId) ?? 0].dot}
                      onSelect={() => onSelectCourse(c.enrollmentId)}
                    />
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

// 주간 아젠다 컴팩트 행(모바일) — 시간·과정·상대방·상태 + 입장 버튼.
function WeekAgendaRow({
  item,
  isTeacher,
  now,
  ko,
  dotClass,
  onSelect,
}: {
  item: ClassItem;
  isTeacher: boolean;
  now: number;
  ko: boolean;
  dotClass: string;
  onSelect: () => void;
}) {
  const cancelled = item.status === "취소";
  const enterable = !cancelled && canEnterClass(now, item.startMs, item.endMs);
  const timeRange = `${fmtTime(item.startMin)}~${fmtTime(lessonEndMin(item.endMin))}`;
  const mark = isTeacher ? conductMark(item, now) : null;
  return (
    <li className="border-rule flex items-center gap-3 border-b px-5 py-3 last:border-b-0">
      <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", dotClass, cancelled && "opacity-40")} />
      <button type="button" onClick={onSelect} className={cn("min-w-0 flex-1 text-left", cancelled && "opacity-60")}>
        <p className={cn("text-ink text-sm font-bold", cancelled && "line-through")}>{timeRange}</p>
        <p className="text-muted-fg mt-0.5 flex items-center gap-1.5 truncate text-xs">
          <span className="truncate">
            {item.courseTitle} · {item.counterpart}
          </span>
          {cancelled && (
            <span className="bg-brand/10 text-brand shrink-0 rounded-full px-2 py-0.5 font-bold">
              {item.cancelReason === "cancel" ? (ko ? "취소" : "Cancelled") : ko ? "연기" : "Postponed"}
            </span>
          )}
          {item.isMakeup && !cancelled && (
            <span className="bg-accent-blue-soft text-accent-blue-ink shrink-0 rounded-full px-2 py-0.5 font-bold">{ko ? "보강" : "Makeup"}</span>
          )}
          {mark === "conducted" && <Circle className="text-cta size-3 shrink-0 fill-current" aria-hidden />}
          {mark === "pending" && <Triangle className="size-3 shrink-0 fill-current text-[#F5A623]" aria-hidden />}
        </p>
      </button>
      {enterable && <EnterClassButton item={item} ko={ko} compact />}
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
