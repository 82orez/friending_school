import type { Metadata } from "next";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { todayKst } from "@/lib/booking";
import { kstDateMinToMs } from "@/lib/classtime";
import FriendingRooms, { type PublicRoom } from "@/components/friending/FriendingRooms";

export const metadata: Metadata = { title: "프렌딩 — 프렌딩 스쿨" };

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

export default async function FriendingPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 공개 조회 — RLS friender_rooms_select_public이 anon에도 열려 있다.
  // .eq("is_visible")는 정책과 중복이지만 랜딩 youtube 쿼리와 같은 belt-and-braces 컨벤션.
  const { data } = await supabase
    .from("friender_rooms")
    .select("id, friender_id, friender_name, friender_nickname, title, description, level, capacity, session_date, start_min, duration_min")
    .eq("is_visible", true)
    .gte("session_date", todayKst())
    .order("session_date", { ascending: true })
    .order("start_min", { ascending: true });

  // 오늘이지만 이미 끝난 방은 SQL로 못 거른다(날짜 단위 필터) → 종료 시각 기준 JS 필터.
  const now = Date.now();
  const rows = ((data ?? []) as RoomRow[]).filter((r) => kstDateMinToMs(r.session_date, r.start_min + r.duration_min) > now);

  // 참여 인원 집계 — 참가자 RLS는 select_own뿐이라 카운트는 service_role로 센다
  // (참가자 신원은 공개하지 않고 숫자만 노출).
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

  // 내 참여 여부 — 본인 세션 client(RLS select_own).
  const joined = new Set<string>();
  if (user && rows.length > 0) {
    const { data: mine } = await supabase.from("friender_room_participants").select("room_id").eq("user_id", user.id);
    for (const m of (mine ?? []) as { room_id: string }[]) joined.add(m.room_id);
  }

  const rooms: PublicRoom[] = rows.map((r) => ({
    id: r.id,
    hostName: r.friender_nickname?.trim() || r.friender_name?.trim() || "프렌더",
    isMine: !!user && r.friender_id === user.id,
    title: r.title,
    description: r.description,
    level: r.level,
    capacity: r.capacity,
    sessionDate: r.session_date,
    startMin: r.start_min,
    durationMin: r.duration_min,
    participants: countByRoom.get(r.id) ?? 0,
    joined: joined.has(r.id),
  }));

  return (
    <div className="bg-surface">
      <div className="mx-auto max-w-[1100px] px-5 py-12 md:py-16">
        <h1 className="text-ink text-2xl font-bold md:text-3xl">프렌딩</h1>
        <p className="text-muted-fg mt-2 text-sm">프렌더가 여는 화상 연습방에 참여해 보세요. 말한 만큼 늘어요.</p>

        <FriendingRooms rooms={rooms} isLoggedIn={!!user} />
      </div>
    </div>
  );
}
