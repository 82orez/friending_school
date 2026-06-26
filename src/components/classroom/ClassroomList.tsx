"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Loader2, Video } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fmtTime, DAY_LABELS_KO, TOTAL_SESSIONS } from "@/lib/availability";
import { canEnterClass } from "@/lib/classtime";
import { enterClass } from "@/app/classroom/actions";

export type ClassItem = {
  id: string;
  courseTitle: string;
  counterpart: string; // 학생 뷰=강사명, 강사 뷰=학생명
  sessionNo: number;
  sessionDate: string; // YYYY-MM-DD (KST)
  startMin: number;
  endMin: number;
  startMs: number;
  endMs: number;
};

// "7월 1일 (월)" — sessionDate(YYYY-MM-DD)를 한국어 날짜 라벨로.
function formatSessionDate(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) return d;
  const dow = DAY_LABELS_KO[new Date(y, m - 1, day).getDay()];
  return `${m}월 ${day}일 (${dow})`;
}

export default function ClassroomList({ classes, isTeacher }: { classes: ClassItem[]; isTeacher: boolean }) {
  // 1분마다 갱신 — 입장 버튼 활성/예정·지난 분리를 시간에 맞춰 갱신.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const { upcoming, past } = useMemo(() => {
    const up: ClassItem[] = [];
    const pa: ClassItem[] = [];
    for (const c of classes) (c.endMs >= now ? up : pa).push(c);
    // 지난 수업은 최신순.
    pa.reverse();
    return { upcoming: up, past: pa };
  }, [classes, now]);

  if (classes.length === 0) {
    return (
      <section className="border-rule overflow-hidden rounded-2xl border bg-white">
        <div className="px-6 py-12 text-center">
          <p className="text-muted-fg text-sm">
            {isTeacher ? "아직 예정된 강의가 없어요." : "아직 예정된 수업이 없어요. 결제가 확인되면 수업이 생성돼요."}
          </p>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <Section title="예정된 수업" count={upcoming.length}>
        {upcoming.length === 0 ? (
          <p className="text-muted-fg px-6 py-8 text-center text-sm">예정된 수업이 없어요.</p>
        ) : (
          <ul className="list-none">
            {upcoming.map((c) => (
              <ClassRow key={c.id} item={c} isTeacher={isTeacher} now={now} />
            ))}
          </ul>
        )}
      </Section>

      {past.length > 0 && (
        <Section title="지난 수업" count={past.length}>
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

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="border-rule overflow-hidden rounded-2xl border bg-white">
      <div className="border-rule flex items-center gap-2 border-b px-6 py-5">
        <span aria-hidden>🎬</span>
        <h2 className="text-ink text-base font-bold">{title}</h2>
        <span className="text-muted-fg-faint ml-auto text-sm">{count}개</span>
      </div>
      {children}
    </section>
  );
}

function ClassRow({ item, isTeacher, now, isPast = false }: { item: ClassItem; isTeacher: boolean; now: number; isPast?: boolean }) {
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
        toast.error(res.error ?? "입장할 수 없어요.");
      }
    });
  }

  return (
    <li className={cn("border-rule flex items-center gap-3 border-b px-6 py-4 last:border-b-0", isPast && "opacity-60")}>
      <div className="min-w-0 flex-1">
        <p className="text-ink truncate text-[15px] font-bold">
          {formatSessionDate(item.sessionDate)} · {fmtTime(item.startMin)}~{fmtTime(item.endMin)}
        </p>
        <p className="text-muted-fg mt-0.5 truncate text-sm">
          {item.courseTitle} · {isTeacher ? "수강생" : "강사"} {item.counterpart}
        </p>
        <p className="text-muted-fg-faint mt-0.5 text-xs">
          {item.sessionNo}/{TOTAL_SESSIONS}회차
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
            입장하기
          </button>
        ) : (
          <span className="text-muted-fg-faint shrink-0 text-xs">시작 15분 전 입장</span>
        ))}
    </li>
  );
}
