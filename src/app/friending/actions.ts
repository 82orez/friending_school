"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { isValidZoomUrl } from "@/lib/url";
import { canEnterClass, kstDateMinToMs } from "@/lib/classtime";

export type JoinResult = { ok: boolean; error?: string };
export type EnterRoomResult = { url?: string; error?: string };

// 프렌더 액션과 달리 일반 회원용이라 역할 가드가 없다 — 로그인 여부만 확인한다.
async function currentUserId(): Promise<string | null> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// join_friender_room RPC 반환 코드 → 사용자 메시지.
const JOIN_ERROR: Record<string, string> = {
  unauthenticated: "로그인이 필요합니다. 다시 로그인해 주세요.",
  not_found: "방을 찾을 수 없어요. 목록을 새로고침해 주세요.",
  not_visible: "지금은 참여할 수 없는 방이에요.",
  own_room: "내가 개설한 방에는 참여할 수 없어요.",
  ended: "이미 종료된 방이에요.",
  full: "정원이 모두 찼어요.",
};

export async function joinRoom(roomId: string): Promise<JoinResult> {
  const id = String(roomId ?? "").trim();
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  // 표시 스냅샷용 이름 — 닉네임 우선, 없으면 성+이름(공백 없이), 그것도 없으면 이메일 앞부분.
  const admin = createAdminClient();
  const { data: prof } = await admin.from("profiles").select("first_name, last_name, nickname").eq("id", user.id).maybeSingle();
  const p = (prof ?? {}) as { first_name?: string | null; last_name?: string | null; nickname?: string | null };
  const userName = p.nickname?.trim() || `${p.last_name ?? ""}${p.first_name ?? ""}` || user.email?.split("@")[0] || null;

  // ⚠️ 본인 세션 client로 호출해야 RPC 안의 auth.uid()가 잡힌다(service_role로 부르면 null).
  const { data, error } = await supabase.rpc("join_friender_room", { p_room_id: id, p_user_name: userName });
  if (error) return { ok: false, error: "참여 처리 중 문제가 발생했습니다." };

  const code = String(data ?? "");
  // already는 실패로 보지 않는다 — 이미 참여한 상태이므로 결과적으로 원하는 상태다(멱등).
  if (code !== "ok" && code !== "already") {
    return { ok: false, error: JOIN_ERROR[code] ?? "참여 처리 중 문제가 발생했습니다." };
  }

  revalidatePath("/friending");
  return { ok: true };
}

export async function leaveRoom(roomId: string): Promise<JoinResult> {
  const id = String(roomId ?? "").trim();
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "로그인이 필요합니다." };

  const admin = createAdminClient();
  const { error } = await admin.from("friender_room_participants").delete().eq("room_id", id).eq("user_id", userId);
  if (error) return { ok: false, error: "취소 처리 중 문제가 발생했습니다." };

  revalidatePath("/friending");
  return { ok: true };
}

// 방 입장 — 참가자(또는 개설자) 검증 + 시간창 검증 후 개설자 zoom URL(최신값) 반환.
// enterClass(src/app/classroom/actions.ts)와 같은 구조. 클라가 새 탭으로 연다.
export async function enterRoom(roomId: string): Promise<EnterRoomResult> {
  const id = String(roomId ?? "").trim();
  if (!id) return { error: "잘못된 요청입니다." };

  const userId = await currentUserId();
  if (!userId) return { error: "로그인이 필요합니다. 다시 로그인해 주세요." };

  const admin = createAdminClient();
  const { data: room } = await admin
    .from("friender_rooms")
    .select("id, friender_id, session_date, start_min, duration_min, is_visible")
    .eq("id", id)
    .maybeSingle();
  if (!room) return { error: "방을 찾을 수 없어요." };
  if (!room.is_visible) return { error: "지금은 입장할 수 없는 방이에요." };

  // 개설자 본인이거나 참가자여야 입장 가능.
  const isHost = room.friender_id === userId;
  if (!isHost) {
    const { data: part } = await admin.from("friender_room_participants").select("room_id").eq("room_id", id).eq("user_id", userId).maybeSingle();
    if (!part) return { error: "먼저 참여하기를 눌러 주세요." };
  }

  // 시간창 검증(서버 authoritative). ⚠️ lessonEndMin은 수업 전용(30→25분 축소)이라 쓰지 않는다.
  const startMs = kstDateMinToMs(room.session_date, room.start_min);
  const endMs = kstDateMinToMs(room.session_date, room.start_min + room.duration_min);
  if (!canEnterClass(Date.now(), startMs, endMs)) {
    return { error: "시작 15분 전부터 입장할 수 있어요." };
  }

  // 개설자 zoom URL 최신값(방 행에 저장하지 않는 이유는 friender_rooms 마이그레이션 주석 참고).
  const { data: host } = await admin.from("profiles").select("zoom_url").eq("id", room.friender_id).maybeSingle();
  const zoomUrl = ((host as { zoom_url?: string | null } | null)?.zoom_url ?? "").trim();
  if (!zoomUrl || !isValidZoomUrl(zoomUrl)) {
    return { error: "개설자의 화상 링크가 아직 등록되지 않았어요." };
  }

  return { url: zoomUrl };
}
