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
    .select("id, teacher_id, course_title, teacher_name, student_name, student_phone, slots, start_date, status, teacher_note, created_at, is_test")
    .order("created_at", { ascending: false });

  const enrollments: AdminEnrollment[] = ((data ?? []) as AdminEnrollment[]).map((e) => ({
    ...e,
    slots: (Array.isArray(e.slots) ? e.slots : []) as Slot[],
  }));

  const teachers = await loadEnrollTeachers();
  const courses = COURSE_SLUGS.map((slug) => ({ slug, title: getCourse(slug)?.title ?? slug }));

  return (
    <div className="space-y-6">
      <TestEnrollmentCreator teachers={teachers} courses={courses} defaultStudentEmail={user?.email ?? ""} />
      <EnrollmentsManager enrollments={enrollments} />
    </div>
  );
}
