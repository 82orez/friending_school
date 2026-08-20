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
  if (!Number.isInteger(capacity) || capacity < 2 || capacity > 100) return { error: "제한 인원은 2~100명 사이로 입력해 주세요." };

  const sessionDate = typeof input?.sessionDate === "string" ? input.sessionDate : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) return { error: "개설 날짜를 선택해 주세요." };

  const today = todayKst();
  if (sessionDate < today) return { error: "지난 날짜에는 방을 개설할 수 없습니다." };
  if (sessionDate > addDaysKst(today, ROOM_MAX_AHEAD_DAYS)) return { error: `개설 날짜는 ${ROOM_MAX_AHEAD_DAYS}일 이내로 선택해 주세요.` };

  const startMin = Number(input?.startMin);
  if (!Number.isInteger(startMin) || startMin < 0 || startMin > 1439 || startMin % 30 !== 0) return { error: "시작 시각을 선택해 주세요." };

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

export async function updateRoom(id: string, input: RoomInput): Promise<RoomActionResult> {
  const userId = await requireFriender();
  if (!userId) return { ok: false, error: "권한이 없습니다." };
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const v = validateRoomInput(input);
  if (v.error || !v.values) return { ok: false, error: v.error ?? "잘못된 요청입니다." };

  const admin = createAdminClient();

  // 이미 시작한 방은 수정 불가(삭제·숨김만 허용) — 관리 화면의 '지난 방' 규칙과 동일.
  const { data: cur } = await admin.from("friender_rooms").select("session_date, start_min").eq("id", id).eq("friender_id", userId).maybeSingle();
  const room = cur as { session_date?: string; start_min?: number } | null;
  if (!room) return { ok: false, error: "방을 찾을 수 없습니다. 목록을 새로고침해 주세요." };
  if (kstDateMinToMs(room.session_date, room.start_min) <= Date.now()) return { ok: false, error: "이미 시작된 방은 수정할 수 없습니다." };

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

export async function setRoomVisibility(id: string, isVisible: boolean): Promise<RoomActionResult> {
  const userId = await requireFriender();
  if (!userId) return { ok: false, error: "권한이 없습니다." };
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { error } = await admin.from("friender_rooms").update({ is_visible: isVisible }).eq("id", id).eq("friender_id", userId);
  if (error) return { ok: false, error: "변경 중 문제가 발생했습니다." };

  revalidatePath("/friender", "layout");
  return { ok: true };
}

export async function deleteRoom(id: string): Promise<RoomActionResult> {
  const userId = await requireFriender();
  if (!userId) return { ok: false, error: "권한이 없습니다." };
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { error } = await admin.from("friender_rooms").delete().eq("id", id).eq("friender_id", userId);
  if (error) return { ok: false, error: "삭제 중 문제가 발생했습니다." };

  revalidatePath("/friender", "layout");
  return { ok: true };
}
