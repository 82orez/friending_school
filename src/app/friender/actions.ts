"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getUserRole, isFrienderRole } from "@/lib/auth";
import { isValidZoomUrl } from "@/lib/url";
import { ROOM_LEVEL_VALUES } from "@/data/room-levels";
import { todayKst } from "@/lib/booking";
import { kstDateMinToMs } from "@/lib/classtime";
import { roomsOverlap, type RoomSlot } from "@/lib/room-time";

export type FrienderActionState = { ok?: boolean; error?: string };

// 프렌더 액션 진입 가드 — 세션으로 role 확인(프렌더 계열 또는 admin) 후 userId 반환.
async function requireFriender(): Promise<string | null> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const role = await getUserRole(supabase, user.id);
  return isFrienderRole(role) || role === "admin" ? user.id : null;
}

// 빈 문자열은 null로 저장, 길이 제한 적용.
function clean(value: FormDataEntryValue | null, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export async function updateFrienderProfile(_prev: FrienderActionState, formData: FormData): Promise<FrienderActionState> {
  const userId = await requireFriender();
  if (!userId) return { error: "권한이 없습니다." };

  const nickname = clean(formData.get("nickname"), 30); // 선택 입력 — 빈 값이면 null로 지워짐
  const bio = clean(formData.get("bio"), 2000);
  const zoomUrl = clean(formData.get("zoom_url"), 500);

  // 이름·국적·성별·전화번호는 프렌더가 수정 불가(승인 시 확정) — 서버에서 읽지도·갱신하지도 않음.
  // 자기소개·Zoom URL은 필수 (clean()이 공백-only를 null로 만들어 우회 차단). 닉네임은 선택이라 제외.
  if (!bio || !zoomUrl) return { error: "필수 항목을 모두 입력해 주세요." };
  if (!isValidZoomUrl(zoomUrl)) return { error: "올바른 Zoom URL을 입력해 주세요. (http:// 또는 https://로 시작)" };

  // service_role로 본인 row의 화이트리스트 컬럼만 갱신 (name/nationality/gender/phone/role 등은 제외).
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ nickname, bio, zoom_url: zoomUrl }).eq("id", userId);
  if (error) return { error: "저장 중 문제가 발생했습니다." };

  revalidatePath("/friender", "layout");
  return { ok: true };
}

export async function updateFrienderAvatar(avatarUrl: string): Promise<FrienderActionState> {
  const userId = await requireFriender();
  if (!userId) return { error: "권한이 없습니다." };

  // 본인 폴더(avatars/<uid>/...)의 공개 URL인지 검증 — 임의 URL 저장 차단.
  if (!avatarUrl || !avatarUrl.includes(`/avatars/${userId}/`)) {
    return { error: "올바르지 않은 이미지 경로입니다." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ avatar_url: avatarUrl }).eq("id", userId);
  if (error) return { error: "이미지 저장 중 문제가 발생했습니다." };

  revalidatePath("/friender", "layout");
  return { ok: true };
}

// 등록된 프로필 사진 삭제(초기화) — 사진은 선택 입력이라 비워둘 수 있다.
// Storage 파일 정리는 클라이언트가 cleanupOldAvatars(userId,"")로 수행(본인 폴더만 지우는 RLS 정책 활용, best-effort).
export async function removeFrienderAvatar(): Promise<FrienderActionState> {
  const userId = await requireFriender();
  if (!userId) return { error: "권한이 없습니다." };

  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ avatar_url: null }).eq("id", userId);
  if (error) return { error: "이미지 삭제 중 문제가 발생했습니다." };

  revalidatePath("/friender", "layout");
  return { ok: true };
}

/* ===== 프렌더 연습방 (friender_rooms) ===== */

// NoticesManager식 run() 헬퍼와 맞추기 위해 ok를 필수로 둔다(FrienderActionState는 ok가 옵셔널).
export type RoomActionResult = { ok: boolean; error?: string };

export type RoomInput = {
  title: string;
  description?: string;
  level: string;
  capacity: number;
  sessionDate: string; // KST YYYY-MM-DD
  startMin: number;
  durationMin: number;
};

const ROOM_TITLE_MAX = 100;
const ROOM_DESC_MAX = 1000;
const ROOM_MAX_AHEAD_DAYS = 90;
// 진행 시간 20분~2시간, 10분 단위. DB check(friender_rooms_duration_min_check)와 범위를 맞춰 둘 것.
const ROOM_DURATIONS: number[] = [];
for (let d = 20; d <= 120; d += 10) ROOM_DURATIONS.push(d);

// clean()의 문자열 버전(액션 인자는 FormData가 아니라 타입 객체로 받는다).
function cleanText(value: string | undefined | null, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

// 개설 폼 검증 — create/update 공용. 반환값이 있으면 에러 메시지.
// 클라 <input min/max>·<select>를 우회한 제출을 서버에서 다시 막는다.
function validateRoomInput(input: RoomInput): { error?: string; values?: Omit<RoomInput, "description"> & { description: string | null } } {
  const title = cleanText(input?.title, ROOM_TITLE_MAX);
  if (!title) return { error: "오늘의 주제를 입력해 주세요." };

  const description = cleanText(input?.description, ROOM_DESC_MAX);

  const level = typeof input?.level === "string" ? input.level : "";
  if (!ROOM_LEVEL_VALUES.includes(level)) return { error: "난이도를 선택해 주세요." };

  const capacity = Number(input?.capacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) return { error: "제한 인원은 1~100명 사이로 입력해 주세요." };

  const sessionDate = typeof input?.sessionDate === "string" ? input.sessionDate : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) return { error: "개설 날짜를 선택해 주세요." };

  const today = todayKst();
  if (sessionDate < today) return { error: "지난 날짜에는 방을 개설할 수 없습니다." };
  if (sessionDate > addDaysKst(today, ROOM_MAX_AHEAD_DAYS)) return { error: `개설 날짜는 ${ROOM_MAX_AHEAD_DAYS}일 이내로 선택해 주세요.` };

  const startMin = Number(input?.startMin);
  if (!Number.isInteger(startMin) || startMin < 0 || startMin > 1439 || startMin % 10 !== 0) return { error: "시작 시각을 선택해 주세요." };

  const durationMin = Number(input?.durationMin);
  if (!ROOM_DURATIONS.includes(durationMin)) return { error: "진행 시간을 선택해 주세요." };

  // 이미 지난 시각 차단(오늘 날짜의 과거 시각).
  if (kstDateMinToMs(sessionDate, startMin) <= Date.now()) return { error: "이미 지난 시각에는 방을 개설할 수 없습니다." };

  return { values: { title, description, level, capacity, sessionDate, startMin, durationMin } };
}

// YYYY-MM-DD + n일 (TZ 비종속).
function addDaysKst(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

// 같은 프렌더의 다른 방과 시간이 겹치는지 검사 — 겹치면 충돌한 방을 돌려준다(에러 문구용).
// 프렌더는 몸이 하나고 두 방의 입장 링크가 같은 zoom_url이라, 겹치면 참가자가 뒤섞인다.
// ⚠️ read-then-write라 원자적이지 않다. 참여 정원(join_friender_room RPC)과 달리 경쟁 주체가
//    여러 명이 아니라 본인 한 명이고 제출 버튼이 pending 동안 잠기므로, EXCLUDE 제약
//    (btree_gist + tstzrange)까지 가는 대신 이 수준을 수용한다.
async function findOverlappingRoom(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  userId: string,
  slot: RoomSlot,
  excludeId?: string,
): Promise<{ title: string; sessionDate: string; startMin: number; durationMin: number } | null> {
  // 어제부터 조회 — 어제 23:30에 시작해 오늘로 넘어온 방을 놓치지 않기 위함.
  // 그보다 과거 방은 이미 종료돼(새 방은 항상 미래 시작) 겹칠 수 없다.
  const { data } = await admin
    .from("friender_rooms")
    .select("id, title, session_date, start_min, duration_min")
    .eq("friender_id", userId)
    .gte("session_date", addDaysKst(todayKst(), -1));

  const rows = (data ?? []) as { id: string; title: string; session_date: string; start_min: number; duration_min: number }[];
  for (const r of rows) {
    if (excludeId && r.id === excludeId) continue;
    const other: RoomSlot = { sessionDate: r.session_date, startMin: r.start_min, durationMin: r.duration_min };
    if (roomsOverlap(slot, other)) {
      return { title: r.title, sessionDate: r.session_date, startMin: r.start_min, durationMin: r.duration_min };
    }
  }
  return null;
}

// 충돌 안내 문구 — 어떤 방과 겹치는지 알려줘야 사용자가 시간을 옮길 수 있다.
function overlapError(c: { title: string; startMin: number; durationMin: number }): string {
  const fmt = (m: number) => `${String(Math.floor((m % 1440) / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return `이미 같은 시간에 개설한 방이 있어요. (${c.title} · ${fmt(c.startMin)}~${fmt(c.startMin + c.durationMin)})`;
}

export async function createRoom(input: RoomInput): Promise<RoomActionResult> {
  const userId = await requireFriender();
  if (!userId) return { ok: false, error: "권한이 없습니다." };

  const v = validateRoomInput(input);
  if (v.error || !v.values) return { ok: false, error: v.error ?? "잘못된 요청입니다." };

  const admin = createAdminClient();

  // Zoom URL이 없으면 입장시킬 곳이 없다 → 개설 차단. 이름은 표시 스냅샷용으로 같은 쿼리에서 함께 읽는다.
  const { data: prof } = await admin.from("profiles").select("first_name, last_name, nickname, zoom_url").eq("id", userId).maybeSingle();
  const profile = (prof ?? {}) as { first_name?: string | null; last_name?: string | null; nickname?: string | null; zoom_url?: string | null };
  if (!profile.zoom_url?.trim()) return { ok: false, error: "먼저 프로필에서 Zoom URL을 등록해 주세요." };

  const conflict = await findOverlappingRoom(admin, userId, v.values);
  if (conflict) return { ok: false, error: overlapError(conflict) };

  const { error } = await admin.from("friender_rooms").insert({
    friender_id: userId,
    // 한국 관례상 성+이름을 공백 없이 붙임(앱 전반의 표시명 규칙).
    friender_name: `${profile.last_name ?? ""}${profile.first_name ?? ""}` || null,
    friender_nickname: profile.nickname ?? null,
    title: v.values.title,
    description: v.values.description,
    level: v.values.level,
    capacity: v.values.capacity,
    session_date: v.values.sessionDate,
    start_min: v.values.startMin,
    duration_min: v.values.durationMin,
  });
  if (error) return { ok: false, error: "개설 중 문제가 발생했습니다." };

  revalidatePath("/friender", "layout");
  return { ok: true };
}

// 예약 인원 — 참가자 RLS는 _select_own뿐이라 개설자도 세션 client로는 못 읽는다(service_role 필요).
// 예약자가 있는 방은 삭제·일정 변경을 막는 판정에 쓴다. 노쇼도 포함해서 센다:
// 노쇼 여부는 시작 후에야 갈리는데 수정은 어차피 시작 전에만 가능하고, 참가 기록은 남아야 한다.
async function countParticipants(admin: ReturnType<typeof createAdminClient>, roomId: string): Promise<number> {
  const { count } = await admin.from("friender_room_participants").select("room_id", { count: "exact", head: true }).eq("room_id", roomId);
  return count ?? 0;
}

export async function updateRoom(id: string, input: RoomInput): Promise<RoomActionResult> {
  const userId = await requireFriender();
  if (!userId) return { ok: false, error: "권한이 없습니다." };
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const v = validateRoomInput(input);
  if (v.error || !v.values) return { ok: false, error: v.error ?? "잘못된 요청입니다." };

  const admin = createAdminClient();

  // 이미 시작한 방은 수정 불가(삭제·숨김만 허용) — 관리 화면의 '지난 방' 규칙과 동일.
  const { data: cur } = await admin
    .from("friender_rooms")
    .select("session_date, start_min, duration_min")
    .eq("id", id)
    .eq("friender_id", userId)
    .maybeSingle();
  const room = cur as { session_date?: string; start_min?: number; duration_min?: number } | null;
  if (!room) return { ok: false, error: "방을 찾을 수 없습니다. 목록을 새로고침해 주세요." };
  if (kstDateMinToMs(room.session_date, room.start_min) <= Date.now()) return { ok: false, error: "이미 시작된 방은 수정할 수 없습니다." };

  // 예약자가 있으면 일정은 고정 — 방 관련 알림 인프라가 없어 옮기면 예약자가 통보 없이 끌려간다.
  // 주제·소개·난이도는 계속 바꿀 수 있다.
  const reserved = await countParticipants(admin, id);
  if (reserved > 0) {
    const scheduleChanged =
      v.values.sessionDate !== room.session_date || v.values.startMin !== room.start_min || v.values.durationMin !== room.duration_min;
    if (scheduleChanged) {
      return { ok: false, error: "예약한 회원이 있어 일정을 변경할 수 없어요. 주제·소개·난이도는 수정할 수 있습니다." };
    }
    // 이미 잡힌 자리를 무효화하는 변경도 같은 이유로 막는다.
    if (v.values.capacity < reserved) {
      return { ok: false, error: `이미 ${reserved}명이 예약해 제한 인원을 그보다 적게 줄일 수 없어요.` };
    }
  }

  // 수정 대상 자신은 제외 — 시간을 그대로 두고 제목만 바꾸는 경우가 막히면 안 된다.
  const conflict = await findOverlappingRoom(admin, userId, v.values, id);
  if (conflict) return { ok: false, error: overlapError(conflict) };

  const { error } = await admin
    .from("friender_rooms")
    .update({
      title: v.values.title,
      description: v.values.description,
      level: v.values.level,
      capacity: v.values.capacity,
      session_date: v.values.sessionDate,
      start_min: v.values.startMin,
      duration_min: v.values.durationMin,
    })
    .eq("id", id)
    .eq("friender_id", userId);
  if (error) return { ok: false, error: "수정 중 문제가 발생했습니다." };

  revalidatePath("/friender", "layout");
  return { ok: true };
}

export async function deleteRoom(id: string): Promise<RoomActionResult> {
  const userId = await requireFriender();
  if (!userId) return { ok: false, error: "권한이 없습니다." };
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();

  // 삭제하면 참가 행이 FK cascade로 사라져 예약자의 마이페이지 기록까지 없어진다.
  const reserved = await countParticipants(admin, id);
  if (reserved > 0) {
    return { ok: false, error: "예약한 회원이 있어 삭제할 수 없어요. 예약이 모두 취소된 뒤에 삭제할 수 있습니다." };
  }

  const { error } = await admin.from("friender_rooms").delete().eq("id", id).eq("friender_id", userId);
  if (error) return { ok: false, error: "삭제 중 문제가 발생했습니다." };

  revalidatePath("/friender", "layout");
  return { ok: true };
}
