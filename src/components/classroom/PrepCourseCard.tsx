"use client";

import { ChevronRight } from "lucide-react";
import { fmtTime } from "@/lib/availability";
import { fmtRoomEnd } from "@/lib/room-time";
import { fmtDateKo, fmtDateShort, frienderLabel } from "@/lib/prep";
import type { PrepCourseSessions } from "@/lib/prep-session";

// 프렙 강좌 카드 — 정규 과정 CourseCard를 미러링한다(같은 껍데기·같은 정보 순서).
// 두 그리드가 한 화면에 나란히 놓이므로 정보 밀도가 어긋나면 바로 눈에 띈다.
// ⚠️ 프렙엔 연기·보강·강사 대체 개념이 없어 그쪽 배지·카운트는 없다.
export default function PrepCourseCard({ course, now, onSelect }: { course: PrepCourseSessions; now: number; onSelect: () => void }) {
  const total = course.sessions.length;
  const done = course.sessions.filter((s) => s.endMs < now).length;
  const next = course.sessions.find((s) => s.endMs >= now);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const dates = course.sessions.map((s) => s.sessionDate);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="border-rule hover:border-accent-blue/50 focus-visible:ring-accent-blue/50 flex flex-col rounded-2xl border bg-white p-5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-ink truncate text-[15px] font-bold">{course.courseTitle}</p>
          <p className="text-muted-fg mt-0.5 truncate text-sm">프렌더 {frienderLabel(course.frienderName, course.frienderNickname)}</p>
        </div>
        <ChevronRight aria-hidden className="text-muted-fg-faint mt-0.5 size-5 shrink-0" />
      </div>

      <p className="text-muted-fg mt-3 text-sm">{next ? `다음 ${fmtDateShort(next.sessionDate)} ${fmtTime(course.startMin)}` : "수업 종료"}</p>

      <dl className="border-rule mt-3 space-y-1 border-t pt-3 text-xs">
        <div className="flex gap-2">
          <dt className="text-muted-fg-faint w-12 shrink-0">기간</dt>
          <dd className="text-muted-fg font-medium">{dates.length > 0 ? `${fmtDateKo(dates[0])} ~ ${fmtDateKo(dates[dates.length - 1])}` : "-"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-fg-faint w-12 shrink-0">시각</dt>
          {/* ⚠️ 종료는 fmtRoomEnd — 자정 넘김 강좌가 25:30으로 새는 것을 막는다. */}
          <dd className="text-muted-fg font-medium">
            {fmtTime(course.startMin)}~{fmtRoomEnd(course.startMin + course.durationMin)}
          </dd>
        </div>
      </dl>

      <div className="mt-3">
        <div className="bg-rule h-1.5 w-full overflow-hidden rounded-full">
          <div className="bg-brand-gradient h-full rounded-full" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-muted-fg-faint mt-1.5 text-xs">
          {total}회 중 {done}회 완료
        </p>
      </div>
    </button>
  );
}
