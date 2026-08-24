import { fmtTime } from "@/lib/availability";
import { fmtRoomEnd } from "@/lib/room-time";
import { fmtDateKo, frienderLabel } from "@/lib/prep";
import type { PrepCourseSessions } from "@/lib/prep-session";
import PrepSessionList from "@/components/prep/PrepSessionList";

// 「내 강의실」의 프렙 강좌 섹션 — 정규 과정(ClassroomList)과 형제로 나란히 놓인다.
//
// ⚠️ ClassroomList 안에 넣지 않는 이유 2가지:
//   ① /teacher/classroom과 공유하는 컴포넌트다(isTeacher 플래그) — 프렙 개념이 강사 화면에 새면 안 된다.
//   ② classes.length === 0이면 자체 빈 상태로 early return 한다 — 프렙만 듣는 회원에게
//      "아직 예정된 수업이 없어요"가 먼저 떠 버린다.
// ⚠️ 프렙 회차를 ClassItem으로 매핑하지도 않는다 — ClassItem은 연기·취소·보강·강사 대체·피드백·
//    conducted를 달고 다니는데 프렙엔 하나도 없어서, 가짜 값이 ClassRow의 상태 머신을 오작동시킨다.
export default function PrepCourseSection({ courses }: { courses: PrepCourseSessions[] }) {
  if (courses.length === 0) return null;

  return (
    <div className="space-y-4">
      {courses.map((c) => {
        const dates = c.sessions.map((s) => s.sessionDate);
        const period = dates.length > 0 ? `${fmtDateKo(dates[0])} ~ ${fmtDateKo(dates[dates.length - 1])} (${dates.length}회)` : "-";
        return (
          <section key={c.courseId} className="border-rule rounded-2xl border bg-white p-5">
            <p className="text-ink truncate text-[15px] font-bold">{c.courseTitle}</p>
            <p className="text-muted-fg mt-0.5 truncate text-sm">프렌더 {frienderLabel(c.frienderName, c.frienderNickname)}</p>

            <dl className="border-rule mt-3 space-y-1 border-t pt-3 text-xs">
              <div className="flex gap-2">
                <dt className="text-muted-fg-faint w-12 shrink-0">기간</dt>
                <dd className="text-muted-fg font-medium">{period}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-fg-faint w-12 shrink-0">시각</dt>
                {/* ⚠️ 종료는 fmtRoomEnd — 자정 넘김 강좌가 25:30으로 새는 것을 막는다. */}
                <dd className="text-muted-fg font-medium">
                  {fmtTime(c.startMin)}~{fmtRoomEnd(c.startMin + c.durationMin)} ({c.durationMin}분)
                </dd>
              </div>
            </dl>

            {/* 회차 목록·입장·출석은 PrepSessionList가 소유한다(1분 틱·목록/달력 토글 포함). */}
            <PrepSessionList sessions={c.sessions} total={c.sessions.length} startMin={c.startMin} durationMin={c.durationMin} />
          </section>
        );
      })}
    </div>
  );
}
