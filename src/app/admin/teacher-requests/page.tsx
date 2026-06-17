import { createAdminClient } from "@/utils/supabase/admin";
import TeacherRequestsManager, { type TeacherApplication, type CurrentTeacher } from "@/components/admin/TeacherRequestsManager";

const STATUS_ORDER: Record<string, number> = { 신청: 0, 거절: 1, 승인: 2 };

export default async function AdminTeacherRequestsPage() {
  const admin = createAdminClient();

  const { data: usersData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const emailById = new Map((usersData?.users ?? []).map((u) => [u.id, u.email ?? "(이메일 없음)"]));

  const { data: appsData } = await admin
    .from("teacher_applications")
    .select("id, user_id, name, phone, intro, experience, status, admin_note, created_at")
    .order("created_at", { ascending: false });

  const applications: TeacherApplication[] = ((appsData ?? []) as Omit<TeacherApplication, "email">[])
    .map((a) => ({ ...a, email: emailById.get(a.user_id) ?? "(이메일 없음)" }))
    // 신청(미처리) → 거절 → 승인 순, 같은 그룹 내 최신순(원본이 created desc)
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));

  const { data: teacherProfiles } = await admin.from("profiles").select("id, first_name, last_name").eq("role", "teacher");
  const currentTeachers: CurrentTeacher[] = ((teacherProfiles ?? []) as { id: string; first_name: string | null; last_name: string | null }[]).map(
    (p) => ({
      id: p.id,
      email: emailById.get(p.id) ?? "(이메일 없음)",
      name: [p.first_name, p.last_name].filter(Boolean).join(" "),
    }),
  );

  return <TeacherRequestsManager applications={applications} currentTeachers={currentTeachers} />;
}
