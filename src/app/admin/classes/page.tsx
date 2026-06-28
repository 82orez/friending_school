import { createAdminClient } from "@/utils/supabase/admin";
import ClassEnrollmentsManager, { type ClassEnrollmentSummary } from "@/components/admin/ClassEnrollmentsManager";

type Row = {
  enrollment_id: string;
  course: string;
  course_title: string;
  teacher_name: string | null;
  student_name: string | null;
  student_english_name: string | null;
  session_date: string;
  status: "예정" | "취소";
  is_makeup: boolean;
};

// 오늘(KST) 'YYYY-MM-DD'.
function todayKst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export default async function AdminClassesPage() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("classes")
    .select("enrollment_id, course, course_title, teacher_name, student_name, student_english_name, session_date, status, is_makeup")
    .order("session_date", { ascending: true });

  const rows = (data ?? []) as Row[];
  const today = todayKst();

  // enrollment_id별 그룹핑 → 과정 인스턴스 요약(클래스 JS 집계).
  const map = new Map<string, ClassEnrollmentSummary>();
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
        makeup: 0,
        firstDate: r.session_date,
        lastDate: r.session_date,
      };
      map.set(r.enrollment_id, g);
    }
    g.total += 1;
    if (r.is_makeup) g.makeup += 1;
    if (r.status === "취소") g.cancelled += 1;
    else if (r.session_date >= today) g.upcoming += 1;
    else g.done += 1;
    if (r.session_date < g.firstDate) g.firstDate = r.session_date;
    if (r.session_date > g.lastDate) g.lastDate = r.session_date;
  }

  // 진행중(예정 있음) 먼저, 그 안에서 가장 가까운 시작일 순.
  const summaries = Array.from(map.values()).sort((a, b) => {
    const ao = a.upcoming > 0 ? 0 : 1;
    const bo = b.upcoming > 0 ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return a.firstDate.localeCompare(b.firstDate);
  });

  return <ClassEnrollmentsManager rows={summaries} />;
}
