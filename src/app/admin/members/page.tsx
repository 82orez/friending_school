import { createAdminClient } from "@/utils/supabase/admin";
import MembersManager, { type AdminMember } from "@/components/admin/MembersManager";

export default async function AdminMembersPage() {
  const admin = createAdminClient();
  const { data: usersData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const { data: profilesData } = await admin.from("profiles").select("id, role, last_name, first_name, english_name, phone");

  const profileById = new Map((profilesData ?? []).map((p) => [p.id, p]));
  const members: AdminMember[] = (usersData?.users ?? [])
    .map((u) => {
      const p = profileById.get(u.id);
      return {
        id: u.id,
        email: u.email ?? "(이메일 없음)",
        created_at: u.created_at ?? "",
        role: p?.role ?? "student",
        email_confirmed: !!u.email_confirmed_at,
        last_name: p?.last_name ?? null,
        first_name: p?.first_name ?? null,
        english_name: p?.english_name ?? null,
        phone: p?.phone ?? null,
      };
    })
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  return <MembersManager members={members} />;
}
