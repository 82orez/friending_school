"use client";

import { useEffect, useState } from "react";
import ClassWeekGrid, { type AdminSession } from "@/components/admin/ClassWeekGrid";

// 센터 매니저 '주간 일정' 탭 — admin ClassWeekGrid 재사용(읽기 전용). 1분 틱으로 라이브/지난 슬롯 음영 갱신.
export default function CenterWeekSchedule({ sessions }: { sessions: AdminSession[] }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div>
      <h2 className="text-ink mb-3 text-lg font-bold">소속 강사 주간 일정</h2>
      {sessions.length === 0 ? (
        <p className="text-muted-fg-faint py-10 text-center text-sm">표시할 수업이 없습니다.</p>
      ) : (
        <ClassWeekGrid sessions={sessions} now={now} readOnly />
      )}
    </div>
  );
}
