import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import EnrollmentsManager, { type AdminEnrollment } from "@/components/admin/EnrollmentsManager";
import TestEnrollmentCreator from "@/components/admin/TestEnrollmentCreator";
import { loadEnrollTeachers } from "@/app/courses/enroll-actions";
import { COURSE_SLUGS, getCourse } from "@/data/courses";
import { type Slot } from "@/lib/availability";

export default async function AdminEnrollmentsPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const { data } = await admin
    .from("enrollments")
    .select("id, teacher_id, course, course_title, teacher_name, student_name, student_phone, slots, start_date, status, teacher_note, created_at, is_test")
    .order("created_at", { ascending: false });

  const enrollments: AdminEnrollment[] = ((data ?? []) as (AdminEnrollment & { course: string })[]).map((e) => ({
    ...e,
    slots: (Array.isArray(e.slots) ? e.slots : []) as Slot[],
    // 수강료 = 과정 고정가(슬러그로 live 해석, 미해석 레거시는 빈 값). 학생 결제대기 패널과 동일 표기.
    priceLabel: getCourse(e.course)?.price ?? "",
  }));

  const teachers = await loadEnrollTeachers();
  const courses = COURSE_SLUGS.map((slug) => ({ slug, title: getCourse(slug)?.title ?? slug }));

  // 테스트 수강신청 학생 후보 — 가입 회원 중 강사 제외·이메일 인증 완료만(회원 관리와 동일 merge 패턴).
  const { data: usersData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const { data: profs } = await admin.from("profiles").select("id, role, first_name, last_name, english_name");
  const profById = new Map((profs ?? []).map((p: { id: string; role: string; first_name: string | null; last_name: string | null; english_name: string | null }) => [p.id, p]));
  const students = (usersData?.users ?? [])
    .filter((u) => u.email && u.email_confirmed_at)
    .map((u) => ({ u, p: profById.get(u.id) }))
    .filter(({ p }) => (p?.role ?? "student") !== "teacher")
    .map(({ u, p }) => {
      const name = p ? [p.last_name, p.first_name].filter(Boolean).join("") || p.english_name || "" : "";
      return { email: u.email as string, label: name ? `${name} (${u.email})` : (u.email as string) };
    })
    .sort((a, b) => a.email.localeCompare(b.email));

  return (
    <div className="space-y-6">
      <TestEnrollmentCreator teachers={teachers} courses={courses} students={students} defaultStudentEmail={user?.email ?? ""} />
      <EnrollmentsManager enrollments={enrollments} />
    </div>
  );
}
