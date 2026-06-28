import { createAdminClient } from "@/utils/supabase/admin";
import ClassesManager, { type AdminClass } from "@/components/admin/ClassesManager";

export default async function AdminClassesPage() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("classes")
    .select(
      "id, enrollment_id, student_id, teacher_id, course, course_title, teacher_name, student_name, student_english_name, session_no, session_date, start_min, end_min, status, is_makeup",
    )
    .order("session_date", { ascending: false })
    .order("start_min", { ascending: true });

  return <ClassesManager classes={(data ?? []) as AdminClass[]} />;
}
