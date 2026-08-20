import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import RoomsManager, { type FrienderRoom } from "@/components/friender/RoomsManager";

export default async function FrienderRoomsPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/friender/rooms");

  // RLS friender_rooms_select_own이 본인 것만 통과시킨다(비공개·지난 방 포함).
  const { data } = await supabase
    .from("friender_rooms")
    .select("id, title, description, level, capacity, session_date, start_min, duration_min")
    .order("session_date", { ascending: false })
    .order("start_min", { ascending: false });

  // 방 입장은 개설자의 zoom_url로 연결되므로 미등록이면 개설을 막는다(서버 액션도 동일 가드).
  const { data: prof } = await supabase.from("profiles").select("zoom_url").eq("id", user.id).maybeSingle();
  const hasZoomUrl = !!(prof as { zoom_url?: string | null } | null)?.zoom_url?.trim();

  return <RoomsManager rooms={(data ?? []) as FrienderRoom[]} hasZoomUrl={hasZoomUrl} />;
}
