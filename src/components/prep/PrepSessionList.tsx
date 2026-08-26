"use client";

import { useEffect, useMemo, useState } from "react";
import { ko as koLocale } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { fmtTime } from "@/lib/availability";
import { fmtRoomEnd } from "@/lib/room-time";
import { canEnterClass } from "@/lib/classtime";
import { fmtDateKoDow, toLocalDate } from "@/lib/prep";
import { enterPrepSession } from "@/app/prep/session-actions";
import EnterZoomButton from "@/components/EnterZoomButton";
import { Calendar } from "@/components/ui/calendar";

// 회차 하나 — 서버(src/lib/prep-session.ts)가 startMs/endMs를 미리 계산해 내려준다.
// 클라는 숫자만 비교한다(ClassroomList의 ClassItem과 같은 규약).
export type PrepSessionView = {
  id: string;
  sessionNo: number;
  sessionDate: string;
  topic: string | null;
  startMs: number;
  endMs: number;
  enteredAt: string | null;
  attendees?: number; // 프렌더 화면 전용
};

type View = "list" | "calendar";

// 프렙 회차 목록 — 수강생(/mypage/classroom 「내 강의실」)과 개설 프렌더(/friender/prep)가 공용한다.
// isHost로만 갈린다: 호스트는 안내 다이얼로그 없이 바로 입장하고, 지난 회차에 '출석 N명'을 본다.
export default function PrepSessionList({
  sessions,
  total,
  startMin,
  durationMin,
  isHost = false,
  zoomReady = true,
  defaultView = "list",
  bare = false,
}: {
  sessions: PrepSessionView[];
  total: number;
  startMin: number;
  durationMin: number;
  isHost?: boolean;
  zoomReady?: boolean;
  // 「내 강의실」 상세는 정규 과정 CourseDetail과 맞춰 달력으로 연다. /friender/prep은 목록 기본.
  defaultView?: View;
  // 바깥 테두리 박스와 「수업 일정 N회」 제목을 생략 — 상세 화면엔 이미 헤더가 있어 이중 제목이 된다.
  bare?: boolean;
}) {
  const [view, setView] = useState<View>(defaultView);

  // 1분 틱 — 입장 시간창 진입과 예정/지난 전환이 새로고침 없이 반영된다
  // (ClassroomList·MyRoomReservations와 같은 방식).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const { upcoming, past } = useMemo(() => {
    const up = sessions.filter((s) => s.endMs >= now);
    // 지난 회차는 최근 것부터(ClassroomList의 SessionList와 같은 규칙).
    const pa = sessions.filter((s) => s.endMs < now).reverse();
    return { upcoming: up, past: pa };
  }, [sessions, now]);

  if (sessions.length === 0) return null;

  const rowProps = { total, startMin, durationMin, isHost, zoomReady, now, boxed: bare };

  return (
    <div className={bare ? undefined : "border-rule mt-3 rounded-xl border p-3"}>
      {/* bare = 상세 화면 — CourseDetail처럼 토글만 좌측에 놓는다(제목은 바깥 헤더가 갖는다). */}
      {bare ? (
        <ViewToggle view={view} setView={setView} />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-ink text-sm font-bold">
            수업 일정 <span className="text-muted-fg-faint font-semibold">{sessions.length}회</span>
          </p>
          <ViewToggle view={view} setView={setView} />
        </div>
      )}

      {view === "list" ? (
        <div className="mt-3">
          <Section title="예정된 수업" count={upcoming.length} empty="남은 수업이 없습니다." boxed={bare}>
            {upcoming.map((s) => (
              <SessionRow key={s.id} session={s} {...rowProps} />
            ))}
          </Section>
          {past.length > 0 && (
            <Section title="지난 수업" count={past.length} boxed={bare} className="mt-4">
              {past.map((s) => (
                <SessionRow key={s.id} session={s} {...rowProps} />
              ))}
            </Section>
          )}
        </div>
      ) : (
        <PrepCalendar sessions={sessions} rowProps={rowProps} />
      )}
    </div>
  );
}

function ViewToggle({ view, setView }: { view: View; setView: (v: View) => void }) {
  // 순서는 정규 과정 ClassroomList의 ViewToggle과 동일(달력 먼저).
  // ⚠️ 표시 순서만이고 기본 선택은 defaultView prop이 정한다(소비처는 모두 달력 기본).
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

function Section({
  title,
  count,
  empty,
  boxed,
  className,
  children,
}: {
  title: string;
  count: number;
  empty?: string;
  // 「내 강의실」 상세에서는 정규 과정 Section과 같은 흰 카드로 그린다.
  // /friender/prep은 이미 강좌 행 안에 중첩돼 있어 카드-in-카드가 되므로 가벼운 헤더를 쓴다.
  boxed?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  if (!boxed) {
    return (
      <section className={className}>
        <p className="text-ink text-sm font-bold">
          {title} <span className="text-muted-fg-faint font-semibold">{count}</span>
        </p>
        {count === 0 ? (
          <p className="text-muted-fg-faint mt-1.5 text-sm">{empty}</p>
        ) : (
          <ul className="border-rule mt-2 list-none overflow-hidden rounded-lg border">{children}</ul>
        )}
      </section>
    );
  }
  return (
    <section className={cn("border-rule overflow-hidden rounded-2xl border bg-white", className)}>
      <div className="border-rule flex items-center gap-2 border-b px-6 py-5">
        <span aria-hidden>🎬</span>
        <h2 className="text-ink text-base font-bold">{title}</h2>
        <span className="text-muted-fg-faint ml-auto text-sm">{count}개</span>
      </div>
      {count === 0 ? <p className="text-muted-fg px-6 py-8 text-center text-sm">{empty}</p> : <ul className="list-none">{children}</ul>}
    </section>
  );
}

type RowProps = { total: number; startMin: number; durationMin: number; isHost: boolean; zoomReady: boolean; now: number; boxed: boolean };

function SessionRow({ session, total, startMin, durationMin, isHost, zoomReady, now, boxed }: { session: PrepSessionView } & RowProps) {
  const enterable = canEnterClass(now, session.startMs, session.endMs);
  const isPast = session.endMs < now;
  const topic = session.topic?.trim();

  return (
    // 여백·타이포는 정규 과정 ClassRow와 같은 값 — 한 화면에서 두 과정이 같은 크기로 읽혀야 한다.
    <li className={cn("border-rule flex items-center gap-3 border-b last:border-b-0", boxed ? "px-6 py-4" : "px-4 py-3.5", isPast && "opacity-60")}>
      <div className="min-w-0 flex-1">
        <p className="text-ink truncate text-[15px] font-bold">
          {/* ⚠️ 종료는 fmtRoomEnd — 자정 넘김 회차가 25:30으로 새는 것을 막는다. */}
          {fmtDateKoDow(session.sessionDate)} · {fmtTime(startMin)}~{fmtRoomEnd(startMin + durationMin)}
        </p>
        <p className="text-muted-fg-faint mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
          <span>
            {session.sessionNo}/{total}회차
          </span>
          {isHost && isPast && (session.attendees ?? 0) > 0 && (
            <span className="bg-surface text-muted-fg rounded-full px-2 py-0.5 font-bold">출석 {session.attendees}명</span>
          )}
          {!isHost && isPast && (
            <span
              className={cn("rounded-full px-2 py-0.5 font-bold", session.enteredAt ? "bg-[#eafff1] text-[#22c55e]" : "bg-rule/60 text-muted-fg")}>
              {session.enteredAt ? "출석" : "미입장"}
            </span>
          )}
        </p>
        {topic && <p className="text-muted-fg mt-1 truncate text-sm">{topic}</p>}
      </div>

      <span className="flex shrink-0 items-center gap-2">
        {enterable ? (
          // 안내 다이얼로그는 수강생에게만 — 호스트는 자기 수업이라 바로 연결한다(연습방과 같은 규칙).
          <EnterZoomButton
            enter={() => enterPrepSession(session.id)}
            withGuide={!isHost}
            label="입장"
            disabled={!zoomReady}
            guideBody={<>Zoom으로 연결됩니다. 얼굴을 보이고 참여하는 것을 원칙으로 하며, 수업 중에는 마이크를 꺼 두었다가 말할 때 켜 주세요.</>}
            className="bg-cta shrink-0 rounded-md px-3.5 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          />
        ) : (
          !isPast && <span className="text-muted-fg-faint shrink-0 text-xs">시작 15분 전 입장</span>
        )}
      </span>
    </li>
  );
}

// 달력 — 회차 일자를 칠하고, 날짜를 누르면 그 날 회차를 아래에 펼친다(입장 버튼 포함).
// ⚠️ 배치·크기·색은 정규 과정 ClassroomCalendar와 **문자열까지 일치**시킨다 — 「내 강의실」에서
//    두 과정을 오갈 때 같은 화면으로 읽혀야 한다(중앙 정렬·카드 래퍼·--cell-size·요일 색·오늘 링).
//    ClassroomCalendar의 cancelled/conducted/pending 모디파이어는 프렙에 없는 개념이라 옮기지 않는다.
function PrepCalendar({ sessions, rowProps }: { sessions: PrepSessionView[]; rowProps: RowProps }) {
  const { now } = rowProps;

  // ⚠️ 문자열을 new Date로 파싱하면 UTC라 KST에서 하루 앞 칸이 칠해진다 → toLocalDate 필수.
  // 지난 회차와 남은 회차를 갈라 정규 과정과 같은 색 언어를 쓴다.
  const { upcoming, past } = useMemo(() => {
    const up: Date[] = [];
    const pa: Date[] = [];
    for (const s of sessions) (s.endMs >= now ? up : pa).push(toLocalDate(s.sessionDate));
    return { upcoming: up, past: pa };
  }, [sessions, now]);

  // 기본 포커스 = 다음 예정 회차(없으면 마지막). 틱에 튀지 않도록 1회만 계산한다.
  const [selected, setSelected] = useState<Date | undefined>(() => {
    const t = Date.now();
    const src = sessions.find((s) => s.endMs >= t) ?? sessions[sessions.length - 1];
    return src ? toLocalDate(src.sessionDate) : undefined;
  });

  // ⚠️ Calendar는 로컬 타임존 Date를 준다 — toISOString()으로 키를 만들면 KST에서 하루 밀린다.
  //    로컬 연·월·일을 직접 조립한다(PrepCourseForm의 toKey와 같은 함정).
  const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const selectedKey = selected ? keyOf(selected) : null;
  const daySessions = sessions.filter((s) => s.sessionDate === selectedKey);

  return (
    <div className="mt-2 space-y-4">
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
            modifiers={{ upcoming, past, sunday: { dayOfWeek: [0] }, saturday: { dayOfWeek: [6] } }}
            modifiersClassNames={{
              upcoming: "bg-accent-blue/10 text-accent-blue-ink font-bold rounded-(--cell-radius)",
              past: "bg-rule/60 text-muted-fg rounded-(--cell-radius)",
              sunday: "!text-brand",
              saturday: "!text-accent-blue-ink",
            }}
            classNames={{
              today: "bg-[#FFF3CD] text-ink font-bold ring-1 ring-[#F5A623] ring-inset rounded-(--cell-radius) !opacity-100",
            }}
            // ⚠️ ui/calendar 기본이 [--cell-size:--spacing(7)]이라 이 한 줄이 크기 차이의 전부다.
            className="[&_.rdp-weekday:first-child]:!text-brand [&_.rdp-weekday:last-child]:!text-accent-blue-ink text-base [--cell-size:--spacing(10)]"
          />
        </div>
      </div>

      <Section title={selectedKey ? fmtDateKoDow(selectedKey) : ""} count={daySessions.length} empty="이 날은 수업이 없어요." boxed={rowProps.boxed}>
        {daySessions.map((s) => (
          <SessionRow key={s.id} session={s} {...rowProps} />
        ))}
      </Section>
    </div>
  );
}
