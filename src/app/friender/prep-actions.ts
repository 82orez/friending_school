"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getUserRole, isFrienderPlusRole } from "@/lib/auth";
import { ROOM_LEVEL_VALUES } from "@/data/room-levels";
import { todayKst } from "@/lib/booking";
import { addDays } from "@/lib/prep";
import {
  PREP_DURATIONS,
  PREP_MAX_AHEAD_DAYS,
  PREP_MAX_CAPACITY,
  PREP_MIN_CAPACITY,
  PREP_MONTHLY_PRICE_KRW,
  PREP_SESSION_COUNT,
  PREP_TOPIC_MAX,
} from "@/data/prep";

// 프렙(가칭) — 프렌더 Plus 유료 강좌. friender/actions.ts가 이미 커서 도메인별로 파일을 나눈다.

export type PrepActionResult = { ok: boolean; error?: string };

export type PrepCourseInput = {
  title: string;
  description?: string;
  level: string;
  capacity: number;
  startMin: number;
  durationMin: number;
  // 회차 — 날짜와 주제를 한 쌍으로 받는다(따로 받으면 개수가 어긋나는 상태가 생긴다). 정확히 PREP_SESSION_COUNT개.
  sessions: { date: string; topic: string }[];
};

const TITLE_MAX = 100;
const DESC_MAX = 1000;

// ⚠️ 프렙은 Plus 전용 — 일반 프렌더는 거부한다(isFrienderPlusRole의 첫 사용처).
//    admin은 미리보기 목적으로 통과시키지 않는다: 개설되면 friender_id가 admin이 돼 데이터가 오염된다.
async function requireFrienderPlus(): Promise<string | null> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return isFrienderPlusRole(await getUserRole(supabase, user.id)) ? user.id : null;
}

function cleanText(value: string | undefined | null, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

// 클라 폼(캘린더·select)을 우회한 제출을 서버에서 다시 막는다.
function validatePrepInput(input: PrepCourseInput): {
  error?: string;
  values?: {
    title: string;
    description: string | null;
    level: string;
    capacity: number;
    startMin: number;
    durationMin: number;
    sessions: { date: string; topic: string }[];
  };
} {
  const title = cleanText(input?.title, TITLE_MAX);
  if (!title) return { error: "강좌명을 입력해 주세요." };

  const description = cleanText(input?.description, DESC_MAX);

  const level = typeof input?.level === "string" ? input.level : "";
  if (!ROOM_LEVEL_VALUES.includes(level)) return { error: "난이도를 선택해 주세요." };

  const capacity = Number(input?.capacity);
  if (!Number.isInteger(capacity) || capacity < PREP_MIN_CAPACITY || capacity > PREP_MAX_CAPACITY) {
    return { error: `제한 인원은 ${PREP_MIN_CAPACITY}~${PREP_MAX_CAPACITY}명 사이로 입력해 주세요.` };
  }

  const startMin = Number(input?.startMin);
  if (!Number.isInteger(startMin) || startMin < 0 || startMin > 1439 || startMin % 10 !== 0) return { error: "시작 시각을 선택해 주세요." };

  const durationMin = Number(input?.durationMin);
  if (!PREP_DURATIONS.includes(durationMin)) return { error: "진행 시간을 선택해 주세요." };

  // 회차 — 월 20회 고정 정책이라 개수가 정확히 맞아야 한다.
  const raw = Array.isArray(input?.sessions) ? input.sessions : [];
  if (raw.length !== PREP_SESSION_COUNT) return { error: `수업 일자는 정확히 ${PREP_SESSION_COUNT}회여야 합니다.` };

  // 날짜 오름차순으로 정렬해 저장한다(session_no = 배열 순서).
  const sessions = raw
    .map((s) => ({
      date: typeof s?.date === "string" ? s.date : "",
      topic: typeof s?.topic === "string" ? s.topic.trim().slice(0, PREP_TOPIC_MAX) : "",
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (sessions.some((s) => !/^\d{4}-\d{2}-\d{2}$/.test(s.date))) return { error: "수업 일자 형식이 올바르지 않습니다." };
  // Array.from — tsconfig target이 낮아 Set 스프레드는 빌드가 막힌다.
  if (Array.from(new Set(sessions.map((s) => s.date))).length !== sessions.length) {
    return { error: "수업 일자에 중복된 날짜가 있습니다." };
  }
  // 주제는 20개 모두 필수 — 유료 강좌라 커리큘럼이 먼저 보여야 한다(클라 버튼 비활성의 서버 짝).
  if (sessions.some((s) => !s.topic)) return { error: "각 회차의 주제를 모두 입력해 주세요." };

  const today = todayKst();
  if (sessions[0].date <= today) return { error: "첫 수업은 내일 이후로 잡아 주세요." };
  if (sessions[sessions.length - 1].date > addDays(today, PREP_MAX_AHEAD_DAYS)) {
    return { error: `수업 일자는 ${PREP_MAX_AHEAD_DAYS}일 이내로 선택해 주세요.` };
  }

  return { values: { title, description, level, capacity, startMin, durationMin, sessions } };
}

export async function createPrepCourse(input: PrepCourseInput): Promise<PrepActionResult> {
  const userId = await requireFrienderPlus();
  if (!userId) return { ok: false, error: "프렌더 Plus만 강좌를 개설할 수 있습니다." };

  const v = validatePrepInput(input);
  if (v.error || !v.values) return { ok: false, error: v.error ?? "잘못된 요청입니다." };

  const admin = createAdminClient();

  // Zoom URL이 없으면 입장시킬 곳이 없다 → 개설 차단(연습방과 동일). 표시 스냅샷도 같은 쿼리에서 읽는다.
  const { data: prof } = await admin.from("profiles").select("first_name, last_name, nickname, zoom_url").eq("id", userId).maybeSingle();
  const profile = (prof ?? {}) as { first_name?: string | null; last_name?: string | null; nickname?: string | null; zoom_url?: string | null };
  if (!profile.zoom_url?.trim()) return { ok: false, error: "먼저 프로필에서 Zoom URL을 등록해 주세요." };

  const { data: created, error } = await admin
    .from("prep_courses")
    .insert({
      friender_id: userId,
      friender_name: `${profile.last_name ?? ""}${profile.first_name ?? ""}` || null,
      friender_nickname: profile.nickname ?? null,
      title: v.values.title,
      description: v.values.description,
      level: v.values.level,
      capacity: v.values.capacity,
      start_min: v.values.startMin,
      duration_min: v.values.durationMin,
      session_count: PREP_SESSION_COUNT,
      // 수강료는 입력받지 않는다 — 관리자가 정한 고정가를 서버가 채우고, 이후 상수가 바뀌어도 이 값은 유지된다.
      price_krw: PREP_MONTHLY_PRICE_KRW,
    })
    .select("id")
    .maybeSingle();
  if (error || !created) return { ok: false, error: "강좌 개설 중 문제가 발생했습니다." };

  const courseId = (created as { id: string }).id;
  const { error: sessionError } = await admin
    .from("prep_sessions")
    .insert(v.values.sessions.map((s, i) => ({ course_id: courseId, session_no: i + 1, session_date: s.date, topic: s.topic })));

  // ⚠️ PostgREST에는 트랜잭션이 없다 — 회차 insert가 실패하면 회차 없는 고아 강좌가 남으므로 보상 삭제한다.
  if (sessionError) {
    await admin.from("prep_courses").delete().eq("id", courseId).eq("friender_id", userId);
    return { ok: false, error: "수업 일자 저장 중 문제가 발생했습니다. 다시 시도해 주세요." };
  }

  revalidatePath("/friender", "layout");
  return { ok: true };
}
