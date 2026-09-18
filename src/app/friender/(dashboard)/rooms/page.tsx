import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { kstDateMinToMs } from "@/lib/classtime";
import { seatHeld } from "@/lib/room-time";
import { seriesKeyOf } from "@/lib/room-series";
import RoomsManager, { type FrienderRoomSeries, type FrienderRoomSession } from "@/components/friender/RoomsManager";

type Row = {
  id: string;
  series_id: string | null;
  title: string;
  description: string | null;
  level: string;
  capacity: number;
  topic: string | null;
  session_date: string;
  start_min: number;
  duration_min: number;
};

export default async function FrienderRoomsPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/friender/rooms");

  // ⚠️ 소유권은 쿼리에서 강제한다 — RLS에 기대면 안 된다.
  //    friender_rooms에는 SELECT 정책이 둘(`_select_own`, `_select_public`)이고 permissive 정책은 OR로 합쳐지는데,
  //    `_select_public`이 is_visible 폐지(20260820220759) 이후 `using (true)`가 되어 로그인 사용자에게 전 방이 열린다.
  //    실제로 이 필터가 없던 동안 남의 방이 관리 목록에 섞여 나왔다.
  const { data } = await supabase
    .from("friender_rooms")
    .select("id, series_id, title, description, level, capacity, topic, session_date, start_min, duration_min")
    .eq("friender_id", user.id)
    .order("session_date", { ascending: true })
    .order("start_min", { ascending: true });

  const rows = (data ?? []) as Row[];

  // 예약 인원 — 참가자 RLS는 select_own뿐이라 개설자도 자기 방 참가자를 세션 client로 못 읽는다.
  // 카운트만 필요하므로 service_role로 집계한다(신원은 노출하지 않음, 프렌딩 홈(/)과 동일 방식).
  const countByRoom = new Map<string, number>();
  const noShowByRoom = new Map<string, number>();
  if (rows.length > 0) {
    const admin = createAdminClient();
    const { data: parts } = await admin
      .from("friender_room_participants")
      .select("room_id, entered_at")
      .in(
        "room_id",
        rows.map((r) => r.id),
      );
    // 노쇼(시작 + 유예까지 미입장)는 자리를 반환한 것으로 보고 카운트에서 빼되,
    // 프렌더가 상황을 알 수 있게 몇 명이 미입장인지는 따로 센다(신원은 노출하지 않음).
    const now = Date.now();
    const startMsByRoom = new Map(rows.map((r) => [r.id, kstDateMinToMs(r.session_date, r.start_min)]));
    for (const p of (parts ?? []) as { room_id: string; entered_at: string | null }[]) {
      const target = seatHeld(p.entered_at, startMsByRoom.get(p.room_id) ?? 0, now) ? countByRoom : noShowByRoom;
      target.set(p.room_id, (target.get(p.room_id) ?? 0) + 1);
    }
  }

  // 시리즈로 묶는다 — 전환 이전 단발 방은 series_id가 null이라 자기 id가 곧 키(1회차 시리즈).
  // ⚠️ 공통값(이름·소개·난이도·정원)은 시리즈의 **마지막 회차**를 대표값으로 쓴다. 일괄 수정
  //    (updateRoomSeries)이 아직 시작하지 않은 회차에만 반영되므로, 지난 회차에는 옛 이름이 남아
  //    있을 수 있다 — 첫 회차를 대표로 삼으면 카드에 옛 이름이 뜬다.
  const bySeries = new Map<string, { row: Row; sessions: FrienderRoomSession[] }>();
  for (const r of rows) {
    const key = seriesKeyOf(r);
    const session: FrienderRoomSession = {
      id: r.id,
      session_date: r.session_date,
      start_min: r.start_min,
      duration_min: r.duration_min,
      topic: r.topic,
      participants: countByRoom.get(r.id) ?? 0,
      noShows: noShowByRoom.get(r.id) ?? 0,
    };
    const found = bySeries.get(key);
    if (found) {
      found.sessions.push(session);
      found.row = r; // 쿼리가 날짜 오름차순이라 마지막 회차가 남는다
    } else {
      bySeries.set(key, { row: r, sessions: [session] });
    }
  }

  const series: FrienderRoomSeries[] = Array.from(bySeries.entries()).map(([key, { row, sessions }]) => ({
    key,
    title: row.title,
    description: row.description,
    level: row.level,
    capacity: row.capacity,
    sessions, // 쿼리가 날짜 오름차순이라 그대로 유지된다
  }));

  // 방 입장은 개설자의 zoom_url로 연결되므로 미등록이면 개설을 막는다(서버 액션도 동일 가드).
  const { data: prof } = await supabase.from("profiles").select("zoom_url").eq("id", user.id).maybeSingle();
  const hasZoomUrl = !!(prof as { zoom_url?: string | null } | null)?.zoom_url?.trim();

  return <RoomsManager series={series} hasZoomUrl={hasZoomUrl} />;
}
