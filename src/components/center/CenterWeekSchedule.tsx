"use client";

import { useEffect, useState } from "react";
import ClassWeekGrid, { type AdminSession } from "@/components/admin/ClassWeekGrid";
import ReassignModal, { type CenterTeacher, type CenterClass } from "@/components/center/ReassignModal";

// AdminSession(회차) → 대체 피커용 CenterClass.
function toCenterClass(s: AdminSession): CenterClass {
  return {
    id: s.classId,
    teacherId: s.teacherId,
    courseTitle: s.courseTitle,
    studentName: s.studentName ?? "Student",
    sessionNo: s.sessionNo,
    sessionDate: s.sessionDate,
    startMin: s.startMin,
    endMin: s.endMin,
  };
}

// 센터 매니저 '주간 일정' 탭 — admin ClassWeekGrid 재사용(읽기 전용) + SlotModal 인라인 강사 대체.
// 1분 틱으로 라이브/지난 슬롯 음영 갱신.
export default function CenterWeekSchedule({ sessions, teachers }: { sessions: AdminSession[]; teachers: CenterTeacher[] }) {
  const [now, setNow] = useState(() => Date.now());
  const [reassignTarget, setReassignTarget] = useState<CenterClass | null>(null);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div>
      <h2 className="text-ink mb-3 text-lg font-bold">Weekly schedule</h2>
      {sessions.length === 0 ? (
        <p className="text-muted-fg-faint py-10 text-center text-sm">No classes to show.</p>
      ) : (
        <ClassWeekGrid sessions={sessions} now={now} readOnly onReassign={(s) => setReassignTarget(toCenterClass(s))} />
      )}

      {reassignTarget && <ReassignModal cls={reassignTarget} teachers={teachers} onClose={() => setReassignTarget(null)} />}
    </div>
  );
}
