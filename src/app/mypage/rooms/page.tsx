import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import type { HostProfile } from "@/components/friending/FriendingRooms";
import MyRoomReservations, { type ReservedRoom } from "@/components/mypage/MyRoomReservations";

type RoomRow = {
  id: string;
  friender_id: string;
  friender_name: string | null;
  friender_nickname: string | null;
  title: string;
  description: string | null;
  level: string;
  capacity: number;
  session_date: string;
  start_min: number;
  duration_min: number;
};

type ProfileRow = {
  id: string;
  avatar_url: string | null;
  nickname: string | null;
  first_name: string | null;
  last_name: string | null;
  bio: string | null;
  nationality: string | null;
  gender: string | null;
};

const ROOM_COLUMNS = "id, friender_id, friender_name, friender_nickname, title, description, level, capacity, session_date, start_min, duration_min";

export default async function MyPageRooms() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/mypage/rooms");

  // 내 예약 — RLS friender_room_participants_select_own + friender_rooms_select_public(임베드).
  const { data } = await supabase.from("friender_room_participants").select(`room_id, friender_rooms(${ROOM_COLUMNS})`).eq("user_id", user.id);

  // ⚠️ 임베드 결과는 many-to-one이라 런타임에 객체로 오지만, 타입 추론(untyped client)은 배열로 본다.
  //    양쪽을 모두 받아 넘긴다.
  const rows = ((data ?? []) as unknown as { room_id: string; friender_rooms: RoomRow | RoomRow[] | null }[])
    .map((p) => (Array.isArray(p.friender_rooms) ? p.friender_rooms[0] : p.friender_rooms))
    .filter((r): r is RoomRow => !!r)
    // 임베드 컬럼은 PostgREST로 정렬할 수 없어 여기서 정렬한다(가까운 순).
    .sort((a, b) => a.session_date.localeCompare(b.session_date) || a.start_min - b.start_min);

  // 참여 인원 카운트 + 개설자 프로필은 /friending/page.tsx와 같은 이유로 service_role로 읽는다
  // (참가자 RLS는 select_own뿐, profiles RLS는 본인 row만).
  const countByRoom = new Map<string, number>();
  const hosts: Record<string, HostProfile> = {};
  if (rows.length > 0) {
    const admin = createAdminClient();
    const roomIds = rows.map((r) => r.id);

    const { data: parts } = await admin.from("friender_room_participants").select("room_id").in("room_id", roomIds);
    for (const p of (parts ?? []) as { room_id: string }[]) {
      countByRoom.set(p.room_id, (countByRoom.get(p.room_id) ?? 0) + 1);
    }

    // ⚠️ email·phone·zoom_url은 select하지 않는다 — zoom_url은 방 입장의 사실상 열쇠라
    //    HTML 페이로드에 실리면 안 된다(/friending과 동일 정책).
    const { data: profs } = await admin
      .from("profiles")
      .select("id, avatar_url, nickname, first_name, last_name, bio, nationality, gender")
      .in("id", Array.from(new Set(rows.map((r) => r.friender_id))));
    for (const p of (profs ?? []) as ProfileRow[]) {
      hosts[p.id] = {
        name: p.nickname?.trim() || `${p.last_name ?? ""}${p.first_name ?? ""}`.trim() || "프렌더",
        avatarUrl: p.avatar_url?.trim() || null,
        nationality: p.nationality,
        gender: p.gender,
        bio: p.bio,
      };
    }
  }

  const reservations: ReservedRoom[] = rows.map((r) => ({
    id: r.id,
    frienderId: r.friender_id,
    fallbackName: r.friender_nickname?.trim() || r.friender_name?.trim() || "프렌더",
    title: r.title,
    description: r.description,
    level: r.level,
    capacity: r.capacity,
    sessionDate: r.session_date,
    startMin: r.start_min,
    durationMin: r.duration_min,
    participants: countByRoom.get(r.id) ?? 0,
  }));

  return <MyRoomReservations rooms={reservations} hosts={hosts} />;
}
