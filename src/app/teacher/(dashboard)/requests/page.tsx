import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getCourse } from "@/data/courses";
import TeacherEnrollments, { type TeacherEnrollment } from "@/components/teacher/TeacherEnrollments";

export default async function TeacherRequestsPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/teacher/requests");

  // 본인에게 온 수강신청(신청 우선 정렬) — RLS enrollments_select_own_teacher로 본인 것만.
  const { data: enrollRows } = await supabase
    .from("enrollments")
    .select("id, student_name, student_english_name, course, course_title, course_english_title, start_date, slots, status, teacher_note, created_at")
    .eq("teacher_id", user.id)
    .order("created_at", { ascending: false });

  // 환불된 수강 판별 — 강사 세션은 payments RLS 미허용이라 service_role로 본인 enrollment id 스코프 조회.
  const enrollIds = (enrollRows ?? []).map((r) => r.id);
  const refundedIds = new Set<string>();
  if (enrollIds.length > 0) {
    const admin = createAdminClient();
    const { data: refundRows } = await admin
      .from("payments")
      .select("enrollment_id, status")
      .in("enrollment_id", enrollIds)
      .in("status", ["cancelled", "partial_cancelled"]);
    for (const p of (refundRows ?? []) as { enrollment_id: string | null }[]) if (p.enrollment_id) refundedIds.add(p.enrollment_id);
  }

  const enrollments: TeacherEnrollment[] = (enrollRows ?? [])
    .map((r) => ({
      id: r.id,
      studentName: r.student_name ?? "학생",
      studentEnglishName: r.student_english_name ?? "",
      // 강사 UI는 영문 — 저장된 슬러그로 영문 과정명 live 해석(미해석 레거시 슬러그는 한글 course_title 폴백).
      courseTitle: getCourse(r.course)?.englishTitle ?? r.course_english_title ?? r.course_title,
      startDate: r.start_date,
      slots: Array.isArray(r.slots) ? r.slots : [],
      status: r.status,
      teacherNote: r.teacher_note,
      createdAt: r.created_at,
      refunded: refundedIds.has(r.id),
    }))
    // 신청(대기) 먼저, 그다음 최신순.
    .sort((a, b) => (a.status === "신청" ? 0 : 1) - (b.status === "신청" ? 0 : 1));

  return <TeacherEnrollments enrollments={enrollments} />;
}
