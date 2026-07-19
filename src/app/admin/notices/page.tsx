import { createAdminClient } from "@/utils/supabase/admin";
import NoticesManager, { type AdminNotice } from "@/components/admin/NoticesManager";

export default async function AdminNoticesPage() {
  // service_role로 전량 조회(비공개·예약 게시분까지 admin 목록에 노출).
  const admin = createAdminClient();
  const { data } = await admin
    .from("notices")
    .select("id, title, body, is_visible, is_pinned, published_at, view_count, created_at")
    .order("is_pinned", { ascending: false })
    .order("published_at", { ascending: false });

  return <NoticesManager notices={(data ?? []) as AdminNotice[]} />;
}
