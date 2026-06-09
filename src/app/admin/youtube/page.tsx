import { createAdminClient } from "@/utils/supabase/admin";
import YoutubeManager, { type AdminVideo } from "@/components/admin/YoutubeManager";

export default async function AdminYoutubePage() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("youtube_videos")
    .select("id, tag, url, title, description, is_visible, sort_order, created_at")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  return <YoutubeManager videos={(data ?? []) as AdminVideo[]} />;
}
