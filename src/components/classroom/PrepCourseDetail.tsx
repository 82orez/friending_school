"use client";

import { ArrowLeft } from "lucide-react";
import type { PrepCourseSessions } from "@/lib/prep-session";
import PrepSessionList from "@/components/prep/PrepSessionList";

// 프렙 강좌 상세 — CourseDetail의 헤더를 미러링한 얇은 껍데기.
// 뷰 토글·목록·달력·입장·출석은 전부 PrepSessionList가 소유한다(중복 구현 금지).
// ⚠️ CourseDetail의 「연기 N/6」은 프렙에 없는 개념이라 렌더하지 않는다.
export default function PrepCourseDetail({ course, onBack }: { course: PrepCourseSessions; onBack: () => void }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="text-muted-fg hover:text-ink focus-visible:ring-accent-blue/50 inline-flex items-center gap-1 rounded text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
          <ArrowLeft className="size-4" />
          목록으로
        </button>
        <h2 className="text-ink truncate text-base font-bold">{course.courseTitle}</h2>
      </div>

      {/* 정규 과정 상세와 같은 기본 뷰(달력). bare=바깥 박스·중복 제목 생략. */}
      <PrepSessionList
        sessions={course.sessions}
        total={course.sessions.length}
        startMin={course.startMin}
        durationMin={course.durationMin}
        defaultView="calendar"
        bare
      />
    </div>
  );
}
