"use client";

import { useEffect, useMemo, useState } from "react";
import { ko as koLocale } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { fmtTime } from "@/lib/availability";
import { fmtRoomEnd } from "@/lib/room-time";
import { canEnterClass } from "@/lib/classtime";
import { fmtDateShort, toLocalDate } from "@/lib/prep";
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

// 프렙 회차 목록 — 수강생(/mypage/prep)과 개설 프렌더(/friender/prep)가 공용한다.
// isHost로만 갈린다: 호스트는 안내 다이얼로그 없이 바로 입장하고, 지난 회차에 '출석 N명'을 본다.
export default function PrepSessionList({
  sessions,
  total,
  startMin,
  durationMin,
  isHost = false,
  zoomReady = true,
}: {
  sessions: PrepSessionView[];
  total: number;
  startMin: number;
  durationMin: number;
  isHost?: boolean;
  zoomReady?: boolean;
}) {
  const [view, setView] = useState<View>("list");

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

  const rowProps = { total, startMin, durationMin, isHost, zoomReady, now };

  return (
    <div className="border-rule mt-3 rounded-xl border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-ink text-sm font-bold">
          수업 일정 <span className="text-muted-fg-faint font-semibold">{sessions.length}회</span>
        </p>
        <ViewToggle view={view} setView={setView} />
      </div>

      {view === "list" ? (
        <div className="mt-3">
          <Section title="예정된 수업" count={upcoming.length} empty="남은 수업이 없습니다.">
            {upcoming.map((s) => (
              <SessionRow key={s.id} session={s} {...rowProps} />
            ))}
          </Section>
          {past.length > 0 && (
            <Section title="지난 수업" count={past.length} className="mt-4">
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
  const tabs: [View, string][] = [
    ["list", "목록"],
    ["calendar", "달력"],
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
            "focus-visible:ring-accent-blue/50 rounded-md px-3.5 py-1 text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:outline-none",
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
  className,
  children,
}: {
  title: string;
  count: number;
  empty?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={className}>
      <p className="text-muted-fg-faint text-xs font-bold">
        {title} <span className="text-muted-fg-faint/70">{count}</span>
      </p>
      {count === 0 ? (
        <p className="text-muted-fg-faint mt-1 text-xs">{empty}</p>
      ) : (
        <ul className="border-rule mt-1.5 list-none overflow-hidden rounded-lg border">{children}</ul>
      )}
    </section>
  );
}

type RowProps = { total: number; startMin: number; durationMin: number; isHost: boolean; zoomReady: boolean; now: number };

function SessionRow({ session, total, startMin, durationMin, isHost, zoomReady, now }: { session: PrepSessionView } & RowProps) {
  const enterable = canEnterClass(now, session.startMs, session.endMs);
  const isPast = session.endMs < now;

  return (
    <li className={cn("border-rule flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2.5 last:border-b-0", isPast && "opacity-60")}>
      <span className="text-muted-fg-faint w-14 shrink-0 text-xs font-bold">
        {session.sessionNo}/{total}강
      </span>
      <span className="text-ink shrink-0 text-sm font-semibold">
        {fmtDateShort(session.sessionDate)} · {fmtTime(startMin)}~{fmtRoomEnd(startMin + durationMin)}
      </span>
      <span className="text-muted-fg min-w-0 flex-1 truncate text-xs">{session.topic?.trim() || "-"}</span>

      <span className="ml-auto flex shrink-0 items-center gap-2">
        {isHost && isPast && (session.attendees ?? 0) > 0 && (
          <span className="bg-surface text-muted-fg rounded-full px-2 py-0.5 text-xs font-bold">출석 {session.attendees}명</span>
        )}
        {!isHost && isPast && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-bold",
              session.enteredAt ? "bg-[#eafff1] text-[#22c55e]" : "bg-rule/60 text-muted-fg",
            )}>
            {session.enteredAt ? "출석" : "미입장"}
          </span>
        )}
        {enterable ? (
          // 안내 다이얼로그는 수강생에게만 — 호스트는 자기 수업이라 바로 연결한다(연습방과 같은 규칙).
          <EnterZoomButton
            enter={() => enterPrepSession(session.id)}
            withGuide={!isHost}
            label="입장"
            disabled={!zoomReady}
            guideBody={<>Zoom으로 연결됩니다. 얼굴을 보이고 참여하는 것을 원칙으로 하며, 수업 중에는 마이크를 꺼 두었다가 말할 때 켜 주세요.</>}
            className="bg-cta shrink-0 rounded-md px-3 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          />
        ) : (
          !isPast && <span className="text-muted-fg-faint shrink-0 text-xs">시작 15분 전 입장</span>
        )}
      </span>
    </li>
  );
}

// 달력 — 회차 일자를 칠하고, 날짜를 누르면 그 날 회차를 아래에 펼친다(입장 버튼 포함).
function PrepCalendar({ sessions, rowProps }: { sessions: PrepSessionView[]; rowProps: RowProps }) {
  // ⚠️ 문자열을 new Date로 파싱하면 UTC라 KST에서 하루 앞 칸이 칠해진다 → toLocalDate 필수.
  const dates = useMemo(() => sessions.map((s) => toLocalDate(s.sessionDate)), [sessions]);

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
    <div className="mt-2">
      <Calendar
        mode="single"
        selected={selected}
        onSelect={setSelected}
        defaultMonth={dates[0]}
        locale={koLocale}
        weekStartsOn={0}
        showOutsideDays={false}
        formatters={{ formatWeekdayName: (d: Date) => d.toLocaleDateString("ko-KR", { weekday: "short" }) }}
        modifiers={{ session: dates, sunday: { dayOfWeek: [0] }, saturday: { dayOfWeek: [6] } }}
        // 수업일은 옅은 배경으로 표시(선택 상태와 구분). 주말 색은 한국 달력 관례.
        modifiersClassNames={{ session: "bg-accent-blue-soft font-bold rounded-md", sunday: "!text-brand", saturday: "!text-accent-blue-ink" }}
      />
      {daySessions.length > 0 ? (
        <ul className="border-rule mt-2 list-none overflow-hidden rounded-lg border">
          {daySessions.map((s) => (
            <SessionRow key={s.id} session={s} {...rowProps} />
          ))}
        </ul>
      ) : (
        <p className="text-muted-fg-faint mt-2 text-xs">선택한 날짜에는 수업이 없습니다.</p>
      )}
    </div>
  );
}
