import { createAdminClient } from "@/utils/supabase/admin";
import RoomsAdminManager, { type AdminRoom, type AdminRoomParticipant } from "@/components/admin/RoomsAdminManager";

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
  created_at: string;
  friender_room_participants: { user_id: string; user_name: string | null; entered_at: string | null; created_at: string }[] | null;
};

export default async function AdminRoomsPage() {
  // service_role로 전 프렌더의 방을 읽는다 — friender_rooms의 SELECT 정책은 소유자/공개 두 갈래뿐이고
  // friender_room_participants는 _select_own뿐이라 세션 client로는 명단을 아예 못 본다(개설자 본인도 못 읽는다).
  const admin = createAdminClient();

  // 날짜 필터 없이 최신순 전량(감사 목적) — "왜 이 방이 아직 프렌딩 홈(/)에 떠 있나"까지 봐야 해서
  // 미래 방만 보는 창은 부적합하다. limit은 안전판이고, order가 desc라 넘칠 때도 최신 500개로 잘린다.
  // ⏳ 500건에 근접하면 cap을 올리지 말고 기간 선택 필터를 붙일 것.
  // ⚠️ 참가자는 .in("room_id", ids)가 아니라 임베드로 받는다 — 이 페이지는 전 프렌더 대상이라 id가
  //    수백 개가 되고, 그만큼의 UUID를 GET 쿼리스트링에 실으면 URL 길이 한계에 걸린다
  //    (다른 세 화면은 프렌더 1명/회원 1명/오늘 이후로 자연스럽게 좁혀져 있어 .in()으로 충분하다).
  const { data } = await admin
    .from("friender_rooms")
    .select(
      "id, friender_id, friender_name, friender_nickname, title, description, level, capacity, session_date, start_min, duration_min, created_at, friender_room_participants(user_id, user_name, entered_at, created_at)",
    )
    .order("session_date", { ascending: false })
    .order("start_min", { ascending: false })
    .limit(500);

  const rows = (data ?? []) as unknown as RoomRow[];

  // 개설자 연락처 — 방을 내릴 때 프렌더에게 연락할 수 있어야 한다. 표시 이름은 방 행의 스냅샷을 쓰고
  // 연락처만 최신값을 읽는다(프렙 페이지와 같은 규칙).
  // ⚠️ zoom_url은 select하지 않는다 — 모니터링·삭제에 필요 없고 방 입장의 사실상 열쇠다.
  // ⚠️ [...new Set()]은 tsconfig target:es5라 빌드에 실패한다.
  const phoneById = new Map<string, string | null>();
  const emailById = new Map<string, string>();
  if (rows.length > 0) {
    const frienderIds = Array.from(new Set(rows.map((r) => r.friender_id)));
    const { data: profs } = await admin.from("profiles").select("id, phone").in("id", frienderIds);
    for (const p of (profs ?? []) as { id: string; phone: string | null }[]) phoneById.set(p.id, p.phone);
    // 이메일은 profiles에 없어 auth 쪽에서 가져온다. perPage 1000을 넘는 회원은 이메일이 비는데,
    // friender-requests·prep 페이지와 같은 기존 한계라 여기서 따로 손대지 않는다.
    const { data: usersData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of usersData?.users ?? []) if (u.email) emailById.set(u.id, u.email);
  }

  const rooms: AdminRoom[] = rows.map((r) => {
    const { friender_room_participants, ...room } = r;
    // 임베드는 정렬을 붙일 수 없다(PostgREST) — 예약 순은 화면에서 그대로 쓰이므로 여기서 맞춘다.
    const participants: AdminRoomParticipant[] = (friender_room_participants ?? []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
    return {
      ...room,
      friender_phone: phoneById.get(r.friender_id) ?? null,
      friender_email: emailById.get(r.friender_id) ?? "",
      participants,
    };
  });

  return <RoomsAdminManager rooms={rooms} />;
}
