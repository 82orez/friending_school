import { createAdminClient } from "@/utils/supabase/admin";
import MembersManager, { type AdminMember } from "@/components/admin/MembersManager";

export default async function AdminMembersPage() {
  const admin = createAdminClient();
  const { data: usersData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const { data: profilesData } = await admin.from("profiles").select("id, role");

  const roleById = new Map((profilesData ?? []).map((p: { id: string; role: string }) => [p.id, p.role]));
  const members: AdminMember[] = (usersData?.users ?? [])
    .map((u) => ({
      id: u.id,
      email: u.email ?? "(이메일 없음)",
      created_at: u.created_at ?? "",
      role: roleById.get(u.id) ?? "student",
    }))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  return <MembersManager members={members} />;
}
