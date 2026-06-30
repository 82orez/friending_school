import { notFound } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import { loadEnrollTeachers } from "@/app/courses/enroll-actions";
import ClassesManager, { type AdminClass } from "@/components/admin/ClassesManager";

export default async function AdminClassDetailPage({ params }: { params: Promise<{ enrollmentId: string }> }) {
  const { enrollmentId } = await params;
  const admin = createAdminClient();
  const { data } = await admin
    .from("classes")
    .select(
      "id, enrollment_id, student_id, teacher_id, course, course_title, teacher_name, student_name, student_english_name, session_no, session_date, start_min, end_min, status, is_makeup, feedback, feedback_at, teacher_entered_at, conducted_at",
    )
    .eq("enrollment_id", enrollmentId)
    .order("session_no", { ascending: true });

  const classes = (data ?? []) as AdminClass[];
  if (classes.length === 0) notFound();

  const teachers = await loadEnrollTeachers();

  const first = classes[0];
  const dates = classes.map((c) => c.session_date).sort();
  const studentLabel = first.student_name ?? "학생";
  const title = `${first.course_title} · ${studentLabel}`;
  const subtitle = `강사 ${first.teacher_name ?? "-"} · 기간 ${dates[0]} ~ ${dates[dates.length - 1]} · 총 ${classes.length}회`;

  return <ClassesManager classes={classes} teachers={teachers} title={title} subtitle={subtitle} backHref="/admin/classes" />;
}
