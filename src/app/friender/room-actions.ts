"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getUserRole, isFrienderRole } from "@/lib/auth";
import { ROOM_LEVEL_VALUES } from "@/data/room-levels";
import { ROOM_MAX_SESSIONS, ROOM_TOPIC_MAX } from "@/data/room-series";
import { todayKst } from "@/lib/booking";
import { kstDateMinToMs } from "@/lib/classtime";
import { addDays } from "@/lib/date-kst";
import { roomsOverlap, type RoomSlot } from "@/lib/room-time";

// 프렌더 무료 연습방(friender_rooms) — **주간 스케줄 시리즈** 개설·수정·삭제.
// friender/actions.ts가 커져 도메인별로 나눴다(prep-actions.ts 선례). 프로필 액션은 그쪽에 남아 있다.
//
// 모델: 시리즈는 테이블이 아니라 **같은 series_id를 가진 방 행들의 묶음**이다. 예약·입장·노쇼·후기가
// 전부 방 단위라 그 로직은 무변경이고, 여기서만 "묶어서 만들고 묶어서 고치는" 일을 한다.

// NoticesManager식 run() 헬퍼와 맞추기 위해 ok를 필수로 둔다(FrienderActionState는 ok가 옵셔널).
export type RoomActionResult = { ok: boolean; error?: string };

// 개설 입력 — 공통값 + 회차 배열. 날짜와 주제를 따로 받으면 개수가 어긋나므로 한 배열로 받는다(prep과 같은 판단).
export type RoomSeriesInput = {
  title: string;
  description?: string;
  level: string;
  capacity: number;
  startMin: number;
  durationMin: number;
  sessions: { date: string; topic: string }[]; // KST YYYY-MM-DD
};

// 시리즈 공통값 일괄 수정 — 일정(날짜·시각)은 여기 없다(회차 개별 수정 담당).
export type RoomSeriesPatch = {
  title: string;
  description?: string;
  level: string;
  capacity: number;
};

// 회차 개별 수정 — 제목·난이도·정원은 시리즈로 올라갔으므로 받지 않는다
// (한 회차만 제목이 다른 상태를 만들지 않기 위해).
export type RoomSessionPatch = {
  sessionDate: string;
  startMin: number;
  durationMin: number;
  topic?: string;
};

const ROOM_TITLE_MAX = 100;
const ROOM_DESC_MAX = 1000;
const ROOM_MAX_AHEAD_DAYS = 90;
const ROOM_MIN_CAPACITY = 1;
const ROOM_MAX_CAPACITY = 100;
// 진행 시간 20분~2시간, 10분 단위. DB check(friender_rooms_duration_min_check)와 범위를 맞춰 둘 것.
const ROOM_DURATIONS: number[] = [];
for (let d = 20; d <= 120; d += 10) ROOM_DURATIONS.push(d);

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

// clean()의 문자열 버전(액션 인자는 FormData가 아니라 타입 객체로 받는다).
function cleanText(value: string | undefined | null, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

// ⚠️ 시리즈 키는 PostgREST의 .or() 필터 문자열에 그대로 들어간다 → 형식을 먼저 검증해 필터 주입을 막는다.
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function revalidateRooms() {
  revalidatePath("/friender", "layout");
  revalidatePath("/"); // 홈 프렌딩 목록
  revalidatePath("/mypage/rooms");
}

/* ===== 검증 ===== */

// 시리즈 공통값 — 개설·일괄 수정 공용.
function validateCommon(input: { title: string; description?: string; level: string; capacity: number }): {
  error?: string;
  values?: { title: string; description: string | null; level: string; capacity: number };
} {
  const title = cleanText(input?.title, ROOM_TITLE_MAX);
  if (!title) return { error: "연습방 이름을 입력해 주세요." };

  const description = cleanText(input?.description, ROOM_DESC_MAX);

  const level = typeof input?.level === "string" ? input.level : "";
  if (!ROOM_LEVEL_VALUES.includes(level)) return { error: "난이도를 선택해 주세요." };

  const capacity = Number(input?.capacity);
  if (!Number.isInteger(capacity) || capacity < ROOM_MIN_CAPACITY || capacity > ROOM_MAX_CAPACITY) {
    return { error: `제한 인원은 ${ROOM_MIN_CAPACITY}~${ROOM_MAX_CAPACITY}명 사이로 입력해 주세요.` };
  }

  return { values: { title, description, level, capacity } };
}

// 시각 2종 — 시리즈 단위로 고정이라 회차마다 검사하지 않는다.
function validateTime(startMin: number, durationMin: number): { error?: string; values?: { startMin: number; durationMin: number } } {
  const s = Number(startMin);
  if (!Number.isInteger(s) || s < 0 || s > 1439 || s % 10 !== 0) return { error: "시작 시각을 선택해 주세요." };
  const d = Number(durationMin);
  if (!ROOM_DURATIONS.includes(d)) return { error: "진행 시간을 선택해 주세요." };
  return { values: { startMin: s, durationMin: d } };
}

// 회차 배열 — 날짜 오름차순으로 정렬해 돌려준다(회차 번호는 이 순서에서 파생된다).
// ⚠️ 클라 <input min>·캘린더 disabled를 우회한 제출을 서버에서 다시 막는다.
function validateSessions(
  sessions: { date: string; topic: string }[],
  startMin: number,
): { error?: string; values?: { date: string; topic: string | null }[] } {
  const raw = Array.isArray(sessions) ? sessions : [];
  if (raw.length === 0) return { error: "수업 요일과 기간을 골라 회차를 만들어 주세요." };
  if (raw.length > ROOM_MAX_SESSIONS) return { error: `회차는 최대 ${ROOM_MAX_SESSIONS}개까지 만들 수 있어요.` };

  const list = raw
    .map((s) => ({ date: typeof s?.date === "string" ? s.date : "", topic: cleanText(s?.topic, ROOM_TOPIC_MAX) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (list.some((s) => !/^\d{4}-\d{2}-\d{2}$/.test(s.date))) return { error: "수업 날짜 형식이 올바르지 않습니다." };
  if (Array.from(new Set(list.map((s) => s.date))).length !== list.length) return { error: "같은 날짜에 회차가 두 번 들어 있어요." };

  const now = Date.now();
  // 이미 지난 시각 차단 — 날짜만 비교하면 오늘의 과거 시각이 통과한다.
  if (list.some((s) => kstDateMinToMs(s.date, startMin) <= now)) return { error: "이미 지난 시각에는 회차를 만들 수 없습니다." };

  const limit = addDays(todayKst(), ROOM_MAX_AHEAD_DAYS);
  if (list[list.length - 1].date > limit) return { error: `마지막 회차는 ${ROOM_MAX_AHEAD_DAYS}일 이내여야 합니다.` };

  return { values: list };
}

/* ===== 시간 겹침 ===== */

type RoomRow = { id: string; title: string; session_date: string; start_min: number; duration_min: number };

// 같은 프렌더의 다른 방과 시간이 겹치는지 검사 — 프렌더는 몸이 하나고 두 방의 입장 링크가 같은
// zoom_url이라, 겹치면 참가자가 뒤섞인다.
// ⚠️ read-then-write라 원자적이지 않다. 경쟁 주체가 본인 한 명이고 제출 버튼이 pending 동안
//    잠기므로 EXCLUDE 제약(btree_gist)까지 가는 대신 이 수준을 수용한다(전환 이전과 같은 판단).
async function findOverlappingRooms(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  userId: string,
  slots: RoomSlot[],
  excludeIds: string[] = [],
): Promise<{ title: string; startMin: number; durationMin: number } | null> {
  // 새 회차끼리도 본다 — 자정을 넘기는 진행 시간이면 같은 시리즈 안에서도 겹칠 수 있다.
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      if (roomsOverlap(slots[i], slots[j])) {
        return { title: "같은 시리즈의 다른 회차", startMin: slots[j].startMin, durationMin: slots[j].durationMin };
      }
    }
  }

  // 어제부터 조회 — 어제 23:30에 시작해 오늘로 넘어온 방을 놓치지 않기 위함.
  const { data } = await admin
    .from("friender_rooms")
    .select("id, title, session_date, start_min, duration_min")
    .eq("friender_id", userId)
    .gte("session_date", addDays(todayKst(), -1));

  const rows = (data ?? []) as RoomRow[];
  for (const r of rows) {
    if (excludeIds.includes(r.id)) continue;
    const other: RoomSlot = { sessionDate: r.session_date, startMin: r.start_min, durationMin: r.duration_min };
    if (slots.some((slot) => roomsOverlap(slot, other))) {
      return { title: r.title, startMin: r.start_min, durationMin: r.duration_min };
    }
  }
  return null;
}

// 충돌 안내 문구 — 어떤 방과 겹치는지 알려줘야 사용자가 시간을 옮길 수 있다.
function overlapError(c: { title: string; startMin: number; durationMin: number }): string {
  const fmt = (m: number) => `${String(Math.floor((m % 1440) / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return `이미 같은 시간에 개설한 방이 있어요. (${c.title} · ${fmt(c.startMin)}~${fmt(c.startMin + c.durationMin)})`;
}

/* ===== 참가자 집계 ===== */

// 예약 인원 — 참가자 RLS는 _select_own뿐이라 개설자도 세션 client로는 못 읽는다(service_role 필요).
// 예약자가 있는 방은 삭제·일정 변경을 막는 판정에 쓴다. 노쇼도 포함해서 센다:
// 노쇼 여부는 시작 후에야 갈리는데 수정은 어차피 시작 전에만 가능하고, 참가 기록은 남아야 한다.
async function countParticipants(admin: ReturnType<typeof createAdminClient>, roomId: string): Promise<number> {
  const { count } = await admin.from("friender_room_participants").select("room_id", { count: "exact", head: true }).eq("room_id", roomId);
  return count ?? 0;
}

// 방 여러 개를 한 번에 — 시리즈 단위 가드(일괄 수정·일괄 삭제)가 쓴다.
async function countParticipantsByRoom(admin: ReturnType<typeof createAdminClient>, roomIds: string[]): Promise<Record<string, number>> {
  if (roomIds.length === 0) return {};
  const { data } = await admin.from("friender_room_participants").select("room_id").in("room_id", roomIds);
  const out: Record<string, number> = {};
  for (const row of (data ?? []) as { room_id: string }[]) out[row.room_id] = (out[row.room_id] ?? 0) + 1;
  return out;
}

// 시리즈에 속한 방 행 — 전환 이전 단발 방(series_id = null)은 자기 id가 곧 시리즈 키다.
async function loadSeriesRows(admin: ReturnType<typeof createAdminClient>, userId: string, key: string): Promise<RoomRow[]> {
  const { data } = await admin
    .from("friender_rooms")
    .select("id, title, session_date, start_min, duration_min")
    .eq("friender_id", userId)
    .or(`series_id.eq.${key},and(id.eq.${key},series_id.is.null)`)
    .order("session_date", { ascending: true });
  return (data ?? []) as RoomRow[];
}

/* ===== 액션 ===== */

export async function createRoomSeries(input: RoomSeriesInput): Promise<RoomActionResult> {
  const userId = await requireFriender();
  if (!userId) return { ok: false, error: "권한이 없습니다." };

  const common = validateCommon(input);
  if (common.error || !common.values) return { ok: false, error: common.error ?? "잘못된 요청입니다." };

  const time = validateTime(input?.startMin, input?.durationMin);
  if (time.error || !time.values) return { ok: false, error: time.error ?? "잘못된 요청입니다." };

  const sessions = validateSessions(input?.sessions, time.values.startMin);
  if (sessions.error || !sessions.values) return { ok: false, error: sessions.error ?? "잘못된 요청입니다." };

  const admin = createAdminClient();

  // Zoom URL이 없으면 입장시킬 곳이 없다 → 개설 차단. 이름은 표시 스냅샷용으로 같은 쿼리에서 함께 읽는다.
  const { data: prof } = await admin.from("profiles").select("first_name, last_name, nickname, zoom_url").eq("id", userId).maybeSingle();
  const profile = (prof ?? {}) as { first_name?: string | null; last_name?: string | null; nickname?: string | null; zoom_url?: string | null };
  if (!profile.zoom_url?.trim()) return { ok: false, error: "먼저 프로필에서 Zoom URL을 등록해 주세요." };

  const slots: RoomSlot[] = sessions.values.map((s) => ({
    sessionDate: s.date,
    startMin: time.values!.startMin,
    durationMin: time.values!.durationMin,
  }));
  const conflict = await findOverlappingRooms(admin, userId, slots);
  if (conflict) return { ok: false, error: overlapError(conflict) };

  const seriesId = crypto.randomUUID();
  // ⚠️ 배열 insert 한 번이라 statement 단위로 원자적이다 — prep처럼 보상 삭제가 필요 없다(거긴 2테이블).
  const { error } = await admin.from("friender_rooms").insert(
    sessions.values.map((s) => ({
      friender_id: userId,
      // 한국 관례상 성+이름을 공백 없이 붙임(앱 전반의 표시명 규칙).
      friender_name: `${profile.last_name ?? ""}${profile.first_name ?? ""}` || null,
      friender_nickname: profile.nickname ?? null,
      series_id: seriesId,
      title: common.values!.title,
      description: common.values!.description,
      topic: s.topic,
      level: common.values!.level,
      capacity: common.values!.capacity,
      session_date: s.date,
      start_min: time.values!.startMin,
      duration_min: time.values!.durationMin,
    })),
  );
  if (error) return { ok: false, error: "개설 중 문제가 발생했습니다." };

  revalidateRooms();
  return { ok: true };
}

// 시리즈 공통값 일괄 수정 — 이름·소개·난이도·정원.
// ⚠️ 대상은 **아직 시작하지 않은 회차만**이다. 지난 회차는 기록이라 소급해서 바꾸지 않는다.
export async function updateRoomSeries(seriesKey: string, patch: RoomSeriesPatch): Promise<RoomActionResult> {
  const userId = await requireFriender();
  if (!userId) return { ok: false, error: "권한이 없습니다." };
  if (!seriesKey || !isUuid(seriesKey)) return { ok: false, error: "잘못된 요청입니다." };

  const common = validateCommon(patch);
  if (common.error || !common.values) return { ok: false, error: common.error ?? "잘못된 요청입니다." };

  const admin = createAdminClient();
  const rows = await loadSeriesRows(admin, userId, seriesKey);
  if (rows.length === 0) return { ok: false, error: "연습방을 찾을 수 없습니다. 목록을 새로고침해 주세요." };

  const now = Date.now();
  const future = rows.filter((r) => kstDateMinToMs(r.session_date, r.start_min) > now);
  if (future.length === 0) return { ok: false, error: "남은 회차가 없어 수정할 수 없어요." };

  // 이미 잡힌 자리를 무효화하는 변경은 막는다 — 남은 회차 중 가장 많이 예약된 수가 하한이다.
  const counts = await countParticipantsByRoom(
    admin,
    future.map((r) => r.id),
  );
  const maxReserved = Math.max(0, ...future.map((r) => counts[r.id] ?? 0));
  if (common.values.capacity < maxReserved) {
    return { ok: false, error: `이미 ${maxReserved}명이 예약한 회차가 있어 제한 인원을 그보다 적게 줄일 수 없어요.` };
  }

  const { error } = await admin
    .from("friender_rooms")
    .update({
      title: common.values.title,
      description: common.values.description,
      level: common.values.level,
      capacity: common.values.capacity,
    })
    .eq("friender_id", userId)
    .in(
      "id",
      future.map((r) => r.id),
    );
  if (error) return { ok: false, error: "수정 중 문제가 발생했습니다." };

  revalidateRooms();
  return { ok: true };
}

// 회차 개별 수정 — 날짜·시각·진행 시간·주제.
export async function updateRoomSession(id: string, patch: RoomSessionPatch): Promise<RoomActionResult> {
  const userId = await requireFriender();
  if (!userId) return { ok: false, error: "권한이 없습니다." };
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const time = validateTime(patch?.startMin, patch?.durationMin);
  if (time.error || !time.values) return { ok: false, error: time.error ?? "잘못된 요청입니다." };

  const sessions = validateSessions([{ date: patch?.sessionDate, topic: patch?.topic ?? "" }], time.values.startMin);
  if (sessions.error || !sessions.values) return { ok: false, error: sessions.error ?? "잘못된 요청입니다." };
  const next = sessions.values[0];

  const admin = createAdminClient();

  // 이미 시작한 회차는 수정 불가(삭제만 허용) — 관리 화면의 '지난 회차' 규칙과 동일.
  const { data: cur } = await admin
    .from("friender_rooms")
    .select("session_date, start_min, duration_min")
    .eq("id", id)
    .eq("friender_id", userId)
    .maybeSingle();
  const room = cur as { session_date?: string; start_min?: number; duration_min?: number } | null;
  if (!room) return { ok: false, error: "회차를 찾을 수 없습니다. 목록을 새로고침해 주세요." };
  if (kstDateMinToMs(room.session_date, room.start_min) <= Date.now()) return { ok: false, error: "이미 시작된 회차는 수정할 수 없습니다." };

  // 예약자가 있으면 일정은 고정 — 방 관련 알림 인프라가 없어 옮기면 예약자가 통보 없이 끌려간다.
  // 주제는 계속 바꿀 수 있다.
  const reserved = await countParticipants(admin, id);
  if (reserved > 0) {
    const scheduleChanged =
      next.date !== room.session_date || time.values.startMin !== room.start_min || time.values.durationMin !== room.duration_min;
    if (scheduleChanged) {
      return { ok: false, error: "예약한 회원이 있어 일정을 변경할 수 없어요. 회차 주제는 수정할 수 있습니다." };
    }
  }

  // 수정 대상 자신은 제외 — 시간을 그대로 두고 주제만 바꾸는 경우가 막히면 안 된다.
  const conflict = await findOverlappingRooms(
    admin,
    userId,
    [{ sessionDate: next.date, startMin: time.values.startMin, durationMin: time.values.durationMin }],
    [id],
  );
  if (conflict) return { ok: false, error: overlapError(conflict) };

  const { error } = await admin
    .from("friender_rooms")
    .update({
      topic: next.topic,
      session_date: next.date,
      start_min: time.values.startMin,
      duration_min: time.values.durationMin,
    })
    .eq("id", id)
    .eq("friender_id", userId);
  if (error) return { ok: false, error: "수정 중 문제가 발생했습니다." };

  revalidateRooms();
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

  // ⚠️ 남의 방 id로 들어오면 delete가 0행이 되는데 PostgREST는 에러를 주지 않는다 →
  //    select로 실제 삭제된 행을 확인해야 "삭제했습니다"라고 거짓 보고하지 않는다.
  const { data: deleted, error } = await admin.from("friender_rooms").delete().eq("id", id).eq("friender_id", userId).select("id");
  if (error) return { ok: false, error: "삭제 중 문제가 발생했습니다." };
  if (!deleted || deleted.length === 0) return { ok: false, error: "회차를 찾을 수 없습니다. 목록을 새로고침해 주세요." };

  revalidateRooms();
  return { ok: true };
}

// 시리즈 통째 삭제 — 예약자가 있는 회차가 하나라도 있으면 거부한다(개별 삭제로 유도).
// deletePrepCourse의 신청자 가드와 같은 규칙: cascade로 남의 기록까지 지우지 않는다.
export async function deleteRoomSeries(seriesKey: string): Promise<RoomActionResult> {
  const userId = await requireFriender();
  if (!userId) return { ok: false, error: "권한이 없습니다." };
  if (!seriesKey || !isUuid(seriesKey)) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const rows = await loadSeriesRows(admin, userId, seriesKey);
  if (rows.length === 0) return { ok: false, error: "연습방을 찾을 수 없습니다. 목록을 새로고침해 주세요." };

  const ids = rows.map((r) => r.id);
  const counts = await countParticipantsByRoom(admin, ids);
  const reservedRooms = ids.filter((id) => (counts[id] ?? 0) > 0).length;
  if (reservedRooms > 0) {
    return {
      ok: false,
      error: `예약한 회원이 있는 회차가 ${reservedRooms}개 있어 전체 삭제할 수 없어요. 예약이 없는 회차는 개별 삭제할 수 있습니다.`,
    };
  }

  const { data: deleted, error } = await admin.from("friender_rooms").delete().eq("friender_id", userId).in("id", ids).select("id");
  if (error) return { ok: false, error: "삭제 중 문제가 발생했습니다." };
  if (!deleted || deleted.length === 0) return { ok: false, error: "연습방을 찾을 수 없습니다. 목록을 새로고침해 주세요." };

  revalidateRooms();
  return { ok: true };
}
