import { createAdminClient } from "@/utils/supabase/admin";
import ClassEnrollmentsManager, { type ClassEnrollmentSummary } from "@/components/admin/ClassEnrollmentsManager";
import { kstDateMinToMs } from "@/lib/classtime";
import { lessonEndMin, summarizeSlots, type Slot } from "@/lib/availability";

// KST 날짜(YYYY-MM-DD) → 요일(0=일). TZ 비종속.
const weekdayOf = (d: string): number => {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).getUTCDay();
};

type Row = {
  enrollment_id: string;
  course: string;
  course_title: string;
  teacher_name: string | null;
  student_name: string | null;
  student_english_name: string | null;
  session_date: string;
  start_min: number;
  end_min: number;
  status: "예정" | "취소";
  is_makeup: boolean;
  cancel_reason: string | null;
};

export default async function AdminClassesPage() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("classes")
    .select("enrollment_id, course, course_title, teacher_name, student_name, student_english_name, session_date, start_min, end_min, status, is_makeup, cancel_reason")
    .order("session_date", { ascending: true });

  const rows = (data ?? []) as Row[];
  // 완료 판정은 시간 기반(강사/수강생 강의실과 동일) — 레슨 종료 시각이 지나면 done.
  const now = Date.now();

  // enrollment_id별 그룹핑 → 과정 인스턴스 요약(클래스 JS 집계).
  const map = new Map<string, ClassEnrollmentSummary>();
  // 주간 시작시각 파생용 — 취소·보강 제외한 정규 수업의 {요일,시작분} 유니크 집합.
  const slotSets = new Map<string, Map<string, Slot>>();
  for (const r of rows) {
    let g = map.get(r.enrollment_id);
    if (!g) {
      g = {
        enrollmentId: r.enrollment_id,
        course: r.course,
        courseTitle: r.course_title,
        studentName: r.student_name,
        studentEnglishName: r.student_english_name,
        teacherName: r.teacher_name,
        total: 0,
        upcoming: 0,
        done: 0,
        cancelled: 0,
        postponed: 0,
        makeup: 0,
        firstDate: r.session_date,
        lastDate: r.session_date,
        schedule: "",
      };
      map.set(r.enrollment_id, g);
      slotSets.set(r.enrollment_id, new Map());
    }
    g.total += 1;
    if (r.is_makeup) g.makeup += 1;
    if (r.status === "취소") {
      g.cancelled += 1;
      if (r.cancel_reason === "student") g.postponed += 1; // 학생 연기만 '남은 연기' 차감
    }
    else if (kstDateMinToMs(r.session_date, lessonEndMin(r.end_min)) >= now) g.upcoming += 1;
    else g.done += 1;
    if (r.session_date < g.firstDate) g.firstDate = r.session_date;
    if (r.session_date > g.lastDate) g.lastDate = r.session_date;
    // 정규 수업(취소·보강 아님)만 주간 패턴에 반영.
    if (r.status !== "취소" && !r.is_makeup) {
      const day = weekdayOf(r.session_date);
      slotSets.get(r.enrollment_id)!.set(`${day}-${r.start_min}`, { day, min: r.start_min });
    }
  }

  // 파생 주간 요일·시작시각 요약(예: "월 14:00 · 수 14:00").
  map.forEach((g, id) => {
    g.schedule = summarizeSlots(Array.from(slotSets.get(id)!.values()), true);
  });

  // 진행중(예정 있음) 먼저, 그 안에서 가장 가까운 시작일 순.
  const summaries = Array.from(map.values()).sort((a, b) => {
    const ao = a.upcoming > 0 ? 0 : 1;
    const bo = b.upcoming > 0 ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return a.firstDate.localeCompare(b.firstDate);
  });

  return <ClassEnrollmentsManager rows={summaries} />;
}
