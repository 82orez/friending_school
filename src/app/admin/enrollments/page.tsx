import { createAdminClient } from "@/utils/supabase/admin";
import EnrollmentsManager, { type AdminEnrollment } from "@/components/admin/EnrollmentsManager";
import { type Slot } from "@/lib/availability";

export default async function AdminEnrollmentsPage() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("enrollments")
    .select("id, course_title, teacher_name, student_name, student_phone, slots, start_date, status, teacher_note, created_at")
    .order("created_at", { ascending: false });

  const enrollments: AdminEnrollment[] = ((data ?? []) as AdminEnrollment[]).map((e) => ({
    ...e,
    slots: (Array.isArray(e.slots) ? e.slots : []) as Slot[],
  }));

  return <EnrollmentsManager enrollments={enrollments} />;
}
