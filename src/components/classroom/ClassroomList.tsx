"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowLeft, ChevronRight, Loader2, Video } from "lucide-react";
import { ko as koLocale, enUS } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fmtTime, DAY_LABELS_KO, TOTAL_SESSIONS, SLOT_MIN, LESSON_MIN } from "@/lib/availability";
import { canEnterClass } from "@/lib/classtime";
import { Calendar } from "@/components/ui/calendar";
import { enterClass } from "@/app/classroom/actions";

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
};

type CourseGroup = {
  enrollmentId: string;
  courseTitle: string;
  counterpart: string;
  items: ClassItem[]; // session_date·start_min asc(서버 정렬 유지)
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

export default function ClassroomList({ classes, isTeacher }: { classes: ClassItem[]; isTeacher: boolean }) {
  // 강사 화면은 영문, 학생 화면은 한국어.
  const ko = !isTeacher;

  // 1분마다 갱신 — 다음 수업·진행률·입장 버튼 활성·예정/지난 분리를 시간에 맞춰 갱신.
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
      else map.set(c.enrollmentId, { enrollmentId: c.enrollmentId, courseTitle: c.courseTitle, counterpart: c.counterpart, items: [c] });
    }
    const nextStart = (g: CourseGroup) => g.items.find((c) => c.endMs >= now)?.startMs ?? Infinity;
    return Array.from(map.values()).sort((a, b) => nextStart(a) - nextStart(b));
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
      </div>

      <ViewToggle view={view} setView={setView} ko={ko} />

      {view === "calendar" ? (
        <ClassroomCalendar classes={group.items} isTeacher={isTeacher} now={now} />
      ) : (
        <SessionList items={group.items} isTeacher={isTeacher} now={now} ko={ko} />
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

// 목록 — 예정/지난 수업(단일 과정).
function SessionList({ items, isTeacher, now, ko }: { items: ClassItem[]; isTeacher: boolean; now: number; ko: boolean }) {
  const upcoming = items.filter((c) => c.endMs >= now);
  const past = items.filter((c) => c.endMs < now).reverse();
  return (
    <div className="space-y-5">
      <Section title={ko ? "예정된 수업" : "Upcoming classes"} count={upcoming.length} ko={ko}>
        {upcoming.length === 0 ? (
          <p className="text-muted-fg px-6 py-8 text-center text-sm">{ko ? "예정된 수업이 없어요." : "No upcoming classes."}</p>
        ) : (
          <ul className="list-none">
            {upcoming.map((c) => (
              <ClassRow key={c.id} item={c} isTeacher={isTeacher} now={now} />
            ))}
          </ul>
        )}
      </Section>

      {past.length > 0 && (
        <Section title={ko ? "지난 수업" : "Past classes"} count={past.length} ko={ko}>
          <ul className="list-none">
            {past.map((c) => (
              <ClassRow key={c.id} item={c} isTeacher={isTeacher} now={now} isPast />
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

// 달력 — 단일 과정 월간. 수업 있는 날 예정/지난 색 구분, 날짜 클릭 시 그 날 수업 목록.
function ClassroomCalendar({ classes, isTeacher, now }: { classes: ClassItem[]; isTeacher: boolean; now: number }) {
  const ko = !isTeacher;

  // 기본 포커스 = 다음 예정 수업(없으면 마지막 수업) 날짜. 1회만 계산(틱에 튀지 않게).
  const [selected, setSelected] = useState<Date | undefined>(() => {
    const t = Date.now();
    const src = classes.find((c) => c.endMs >= t) ?? classes[classes.length - 1];
    return src ? parseDate(src.sessionDate) : new Date();
  });

  const { byDate, upcoming, past } = useMemo(() => {
    const byDate = new Map<string, ClassItem[]>();
    for (const c of classes) {
      const arr = byDate.get(c.sessionDate) ?? [];
      arr.push(c);
      byDate.set(c.sessionDate, arr);
    }
    const upcoming: Date[] = [];
    const past: Date[] = [];
    for (const [ds, dItems] of Array.from(byDate.entries())) {
      (dItems.some((c) => c.endMs >= now) ? upcoming : past).push(parseDate(ds));
    }
    return { byDate, upcoming, past };
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
            showOutsideDays
            modifiers={{ upcoming, past }}
            modifiersClassNames={{
              upcoming: "bg-accent-blue/10 text-accent-blue-ink font-bold rounded-(--cell-radius)",
              past: "bg-rule/60 text-muted-fg rounded-(--cell-radius)",
            }}
            classNames={{
              today: "bg-accent-blue/10 text-accent-blue-ink font-bold ring-1 ring-accent-blue ring-inset rounded-(--cell-radius) !opacity-100",
            }}
            className="text-base [--cell-size:--spacing(10)]"
          />
        </div>
      </div>

      <Section title={selectedStr ? formatSessionDate(selectedStr, ko) : ""} count={dayItems.length} ko={ko}>
        {dayItems.length === 0 ? (
          <p className="text-muted-fg px-6 py-8 text-center text-sm">{ko ? "이 날은 수업이 없어요." : "No classes on this day."}</p>
        ) : (
          <ul className="list-none">
            {dayItems.map((c) => (
              <ClassRow key={c.id} item={c} isTeacher={isTeacher} now={now} isPast={c.endMs < now} />
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function CourseCard({ group, isTeacher, now, onSelect }: { group: CourseGroup; isTeacher: boolean; now: number; onSelect: () => void }) {
  const ko = !isTeacher;
  const total = group.items.length;
  const done = group.items.filter((c) => c.endMs < now).length;
  const next = group.items.find((c) => c.endMs >= now);
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

function ClassRow({ item, isTeacher, now, isPast = false }: { item: ClassItem; isTeacher: boolean; now: number; isPast?: boolean }) {
  const ko = !isTeacher;
  const [pending, startTransition] = useTransition();
  const enterable = !isPast && canEnterClass(now, item.startMs, item.endMs);

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

  return (
    <li className={cn("border-rule flex items-center gap-3 border-b px-6 py-4 last:border-b-0", isPast && "opacity-60")}>
      <div className="min-w-0 flex-1">
        <p className="text-ink truncate text-[15px] font-bold">
          {formatSessionDate(item.sessionDate, ko)} · {fmtTime(item.startMin)}~{fmtTime(item.endMin - (SLOT_MIN - LESSON_MIN))}
        </p>
        <p className="text-muted-fg-faint mt-0.5 text-xs">
          {ko ? `${item.sessionNo}/${TOTAL_SESSIONS}회차` : `Session ${item.sessionNo}/${TOTAL_SESSIONS}`}
        </p>
      </div>

      {!isPast &&
        (enterable ? (
          <button
            type="button"
            onClick={handleEnter}
            disabled={pending}
            className="bg-cta inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50">
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Video className="size-3.5" />}
            {ko ? "입장하기" : "Enter"}
          </button>
        ) : (
          <span className="text-muted-fg-faint shrink-0 text-xs">{ko ? "시작 15분 전 입장" : "Opens 15 min before"}</span>
        ))}
    </li>
  );
}
