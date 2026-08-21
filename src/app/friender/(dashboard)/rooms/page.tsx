import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
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

  const rows = (data ?? []) as Omit<FrienderRoom, "participants">[];

  // 예약 인원 — 참가자 RLS는 select_own뿐이라 개설자도 자기 방 참가자를 세션 client로 못 읽는다.
  // 카운트만 필요하므로 service_role로 집계한다(신원은 노출하지 않음, /friending과 동일 방식).
  const countByRoom = new Map<string, number>();
  if (rows.length > 0) {
    const admin = createAdminClient();
    const { data: parts } = await admin
      .from("friender_room_participants")
      .select("room_id")
      .in(
        "room_id",
        rows.map((r) => r.id),
      );
    for (const p of (parts ?? []) as { room_id: string }[]) {
      countByRoom.set(p.room_id, (countByRoom.get(p.room_id) ?? 0) + 1);
    }
  }

  const rooms: FrienderRoom[] = rows.map((r) => ({ ...r, participants: countByRoom.get(r.id) ?? 0 }));

  // 방 입장은 개설자의 zoom_url로 연결되므로 미등록이면 개설을 막는다(서버 액션도 동일 가드).
  const { data: prof } = await supabase.from("profiles").select("zoom_url").eq("id", user.id).maybeSingle();
  const hasZoomUrl = !!(prof as { zoom_url?: string | null } | null)?.zoom_url?.trim();

  return <RoomsManager rooms={rooms} hasZoomUrl={hasZoomUrl} />;
}
