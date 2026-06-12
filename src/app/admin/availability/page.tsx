import { createAdminClient } from "@/utils/supabase/admin";
import AvailabilityViewer, { type TeacherAvailability } from "@/components/admin/AvailabilityViewer";

export default async function AdminAvailabilityPage() {
  const admin = createAdminClient();

  // 강사 프로필 목록 (service_role → RLS 우회).
  const { data: teachers } = await admin.from("profiles").select("id, full_name").eq("role", "teacher");
  const ids = (teachers ?? []).map((t: { id: string }) => t.id);

  // 강사 가용 시간 일괄 조회 후 teacher_id별 그룹핑.
  const slotsByTeacher = new Map<string, { day: number; min: number }[]>();
  if (ids.length > 0) {
    const { data: rows } = await admin.from("teacher_availability").select("teacher_id, day_of_week, start_min").in("teacher_id", ids);
    for (const r of rows ?? []) {
      const list = slotsByTeacher.get(r.teacher_id) ?? [];
      list.push({ day: r.day_of_week, min: r.start_min });
      slotsByTeacher.set(r.teacher_id, list);
    }
  }

  // 이메일 보강(full_name null 폴백용).
  const emailById = new Map<string, string>();
  if (ids.length > 0) {
    const { data: usersData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of usersData?.users ?? []) if (u.email) emailById.set(u.id, u.email);
  }

  const items: TeacherAvailability[] = (teachers ?? []).map((t: { id: string; full_name: string | null }) => ({
    id: t.id,
    name: t.full_name || emailById.get(t.id) || t.id.slice(0, 8),
    email: emailById.get(t.id) ?? "",
    slots: slotsByTeacher.get(t.id) ?? [],
  }));
  items.sort((a, b) => a.name.localeCompare(b.name));

  return <AvailabilityViewer teachers={items} />;
}
