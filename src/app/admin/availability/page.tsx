import { createAdminClient } from "@/utils/supabase/admin";
import AvailabilityViewer, { type TeacherAvailability } from "@/components/admin/AvailabilityViewer";

export default async function AdminAvailabilityPage() {
  const admin = createAdminClient();

  // 강사 프로필 목록 (service_role → RLS 우회).
  const { data: teachers } = await admin.from("profiles").select("id, first_name, last_name").eq("role", "teacher");
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

  // 이메일 보강(이름 null 폴백용).
  const emailById = new Map<string, string>();
  if (ids.length > 0) {
    const { data: usersData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of usersData?.users ?? []) if (u.email) emailById.set(u.id, u.email);
  }

  const items: (TeacherAvailability & { lastName: string })[] = (teachers ?? []).map((t: { id: string; first_name: string | null; last_name: string | null }) => {
    const fullName = [t.first_name, t.last_name].filter(Boolean).join(" ").trim();
    return {
      id: t.id,
      name: fullName || emailById.get(t.id) || t.id.slice(0, 8),
      lastName: (t.last_name || t.first_name || "").trim(),
      email: emailById.get(t.id) ?? "",
      slots: slotsByTeacher.get(t.id) ?? [],
    };
  });
  // 성(last name) 기준 정렬, 성 없으면 표시명 폴백.
  items.sort((a, b) => (a.lastName || a.name).localeCompare(b.lastName || b.name));

  return <AvailabilityViewer teachers={items} />;
}
