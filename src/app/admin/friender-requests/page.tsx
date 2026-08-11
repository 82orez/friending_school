import { createAdminClient } from "@/utils/supabase/admin";
import FrienderRequestsManager, { type FrienderApplication, type CurrentFriender } from "@/components/admin/FrienderRequestsManager";

// 미처리(신청) → 거절 → 승인 순으로 노출(같은 그룹 내에서는 최신순 유지).
const STATUS_ORDER: Record<string, number> = { 신청: 0, 거절: 1, 승인: 2 };

export default async function AdminFrienderRequestsPage() {
  const admin = createAdminClient();

  const { data: usersData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const emailById = new Map((usersData?.users ?? []).map((u) => [u.id, u.email ?? "(이메일 없음)"]));

  const { data: appsData } = await admin
    .from("friender_applications")
    .select("id, user_id, name, phone, nationality, gender, intro, zoom_url, avatar_url, status, admin_note, created_at")
    .order("created_at", { ascending: false });

  const applications: FrienderApplication[] = ((appsData ?? []) as Omit<FrienderApplication, "email">[])
    .map((a) => ({ ...a, email: emailById.get(a.user_id) ?? "(이메일 없음)" }))
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));

  const { data: frienderProfiles } = await admin
    .from("profiles")
    .select("id, first_name, last_name, avatar_url, zoom_url, bio, phone, nationality, gender")
    .eq("role", "friender");

  const currentFrienders: CurrentFriender[] = (
    (frienderProfiles ?? []) as {
      id: string;
      first_name: string | null;
      last_name: string | null;
      avatar_url: string | null;
      zoom_url: string | null;
      bio: string | null;
      phone: string | null;
      nationality: string | null;
      gender: string | null;
    }[]
  ).map((p) => ({
    id: p.id,
    email: emailById.get(p.id) ?? "(이메일 없음)",
    // 한국 관례상 성+이름을 공백 없이 붙임(신청 액션의 name 조합과 동일 규칙).
    name: `${p.last_name ?? ""}${p.first_name ?? ""}`,
    phone: p.phone,
    nationality: p.nationality,
    gender: p.gender,
    bio: p.bio,
    zoomUrl: p.zoom_url,
    avatarUrl: p.avatar_url,
  }));

  return <FrienderRequestsManager applications={applications} currentFrienders={currentFrienders} />;
}
