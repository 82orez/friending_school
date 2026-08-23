"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getUserRole, isFrienderPlusRole } from "@/lib/auth";
import { ROOM_LEVEL_VALUES, roomLevelLabelKo } from "@/data/room-levels";
import { todayKst } from "@/lib/booking";
import { addDays, fmtDateKo } from "@/lib/prep";
import { fmtTime } from "@/lib/availability";
import { fmtRoomEnd } from "@/lib/room-time";
import { getAdminEmails } from "@/utils/supabase/admin";
import { sendPrepCourseReviewRequestNotification } from "@/lib/mailer";
import { rateLimit } from "@/lib/rate-limit";
import {
  PREP_REQUESTABLE_STATUSES,
  type PrepStatus,
  PREP_DURATIONS,
  PREP_MAX_AHEAD_DAYS,
  PREP_MAX_CAPACITY,
  PREP_MIN_CAPACITY,
  PREP_MAX_PRICE_KRW,
  PREP_MIN_PRICE_KRW,
  PREP_SESSION_COUNT,
  PREP_TOPIC_MAX,
} from "@/data/prep";

// 프렙(가칭) — 프렌더 Plus 유료 강좌. friender/actions.ts가 이미 커서 도메인별로 파일을 나눈다.

export type PrepActionResult = { ok: boolean; error?: string };
// 개설은 id를 돌려준다 — 클라가 저장 직후 이어서 승인 요청을 걸 수 있게(작성중 → 신청).
export type PrepCreateResult = PrepActionResult & { id?: string };
// 수정은 '이번 저장으로 승인이 해제됐는지'를 돌려준다(심사 대상 항목이 바뀐 경우만 true).
export type PrepUpdateResult = PrepActionResult & { reReview?: boolean };

export type PrepCourseInput = {
  title: string;
  description?: string;
  level: string;
  capacity: number;
  priceKrw: number;
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
function validatePrepInput(
  input: PrepCourseInput,
  // allowPastDates: 시작 후 강좌 수정에서는 지나간 회차가 그대로 들어오므로 '내일 이후' 규칙을 건너뛴다.
  // allowEmptyTopics: '작성중'·'거절' 초안 저장은 주제를 나눠 채울 수 있다(완결 검사는 승인 요청에서).
  opts: { allowPastDates?: boolean; allowEmptyTopics?: boolean } = {},
): {
  error?: string;
  values?: {
    title: string;
    description: string | null;
    level: string;
    capacity: number;
    priceKrw: number;
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

  // 수강료는 프렌더가 직접 정한다(과거엔 관리자 고정가였다) — 범위만 서버에서 다시 막는다.
  const priceKrw = Number(input?.priceKrw);
  if (!Number.isInteger(priceKrw) || priceKrw < PREP_MIN_PRICE_KRW || priceKrw > PREP_MAX_PRICE_KRW) {
    return { error: `수강료는 ${PREP_MIN_PRICE_KRW.toLocaleString("ko-KR")}~${PREP_MAX_PRICE_KRW.toLocaleString("ko-KR")}원 사이로 입력해 주세요.` };
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
  // ⚠️ 날짜 20개 규칙은 초안에서도 완화하지 않는다 — session_no·RPC(length_mismatch)·sessions[0] 참조가 모두 여기에 기댄다.
  if (!opts.allowEmptyTopics && sessions.some((s) => !s.topic)) return { error: "각 회차의 주제를 모두 입력해 주세요." };

  const today = todayKst();
  if (!opts.allowPastDates) {
    if (sessions[0].date <= today) return { error: "첫 수업은 내일 이후로 잡아 주세요." };
    if (sessions[sessions.length - 1].date > addDays(today, PREP_MAX_AHEAD_DAYS)) {
      return { error: `수업 일자는 ${PREP_MAX_AHEAD_DAYS}일 이내로 선택해 주세요.` };
    }
  }

  return { values: { title, description, level, capacity, priceKrw, startMin, durationMin, sessions } };
}

// 저장은 언제나 '작성중' 초안이다 — 심사는 별도 버튼(requestPrepReview)에서 시작한다.
export async function createPrepCourse(input: PrepCourseInput): Promise<PrepCreateResult> {
  const userId = await requireFrienderPlus();
  if (!userId) return { ok: false, error: "프렌더 Plus만 강좌를 개설할 수 있습니다." };

  const v = validatePrepInput(input, { allowEmptyTopics: true });
  if (v.error || !v.values) return { ok: false, error: v.error ?? "잘못된 요청입니다." };

  const admin = createAdminClient();

  // ⚠️ Zoom URL은 여기서 막지 않는다 — 초안을 먼저 써 두고 나중에 등록할 수 있어야 한다.
  //    입장 경로가 없으면 곤란한 건 '승인 요청' 시점이라 검사도 그쪽(requestPrepReview)에 있다.
  const { data: prof } = await admin.from("profiles").select("first_name, last_name, nickname").eq("id", userId).maybeSingle();
  const profile = (prof ?? {}) as { first_name?: string | null; last_name?: string | null; nickname?: string | null };

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
      // 수강료는 강좌마다 저장한다 — 폼 기본값 상수를 나중에 바꿔도 기존 강좌는 영향받지 않는다.
      price_krw: v.values.priceKrw,
      status: "작성중",
    })
    .select("id")
    .maybeSingle();
  if (error || !created) return { ok: false, error: "강좌 개설 중 문제가 발생했습니다." };

  const courseId = (created as { id: string }).id;
  const { error: sessionError } = await admin
    .from("prep_sessions")
    // 초안은 주제가 비어 있을 수 있다 — 빈 문자열 대신 null로 저장한다(replace_prep_sessions의 nullif와 같은 규칙).
    .insert(v.values.sessions.map((s, i) => ({ course_id: courseId, session_no: i + 1, session_date: s.date, topic: s.topic || null })));

  // ⚠️ PostgREST에는 트랜잭션이 없다 — 회차 insert가 실패하면 회차 없는 고아 강좌가 남으므로 보상 삭제한다.
  if (sessionError) {
    await admin.from("prep_courses").delete().eq("id", courseId).eq("friender_id", userId);
    return { ok: false, error: "수업 일자 저장 중 문제가 발생했습니다. 다시 시도해 주세요." };
  }

  revalidatePrep();
  return { ok: true, id: courseId };
}

// 프렙 화면 재검증 — 프렌더 탭과 admin 심사 목록이 함께 바뀐다.
function revalidatePrep(): void {
  revalidatePath("/friender", "layout");
  revalidatePath("/admin/prep");
}

// replace_prep_sessions RPC 반환 코드 → 사용자 메시지.
const REPLACE_ERROR: Record<string, string> = {
  unauthenticated: "로그인이 필요합니다. 다시 로그인해 주세요.",
  not_found: "강좌를 찾을 수 없습니다. 목록을 새로고침해 주세요.",
  forbidden: "본인이 개설한 강좌만 수정할 수 있습니다.",
  length_mismatch: "수업 일자와 주제 수가 맞지 않습니다.",
};

export async function updatePrepCourse(id: string, input: PrepCourseInput): Promise<PrepUpdateResult> {
  const courseId = String(id ?? "").trim();
  if (!courseId) return { ok: false, error: "잘못된 요청입니다." };

  const userId = await requireFrienderPlus();
  if (!userId) return { ok: false, error: "프렌더 Plus만 강좌를 수정할 수 있습니다." };

  const admin = createAdminClient();

  // 소유권 + 현재 값 확인. 회차는 첫 회차 판정(started)·'시작 후 날짜 유지'·재심사 판정에 쓴다.
  const { data: cur } = await admin
    .from("prep_courses")
    .select("id, status, title, level, capacity, price_krw, start_min, duration_min, prep_sessions(session_no, session_date)")
    .eq("id", courseId)
    .eq("friender_id", userId)
    .maybeSingle();
  const course = cur as {
    status: PrepStatus;
    title: string;
    level: string;
    capacity: number;
    price_krw: number;
    start_min: number;
    duration_min: number;
    prep_sessions: { session_no: number; session_date: string }[] | null;
  } | null;
  if (!course) return { ok: false, error: "강좌를 찾을 수 없습니다. 목록을 새로고침해 주세요." };

  const currentDates = (course.prep_sessions ?? []).slice().sort((a, b) => a.session_date.localeCompare(b.session_date));
  // 이미 시작된 강좌는 일정·시각을 고정한다 — 지나간 회차의 날짜가 바뀌는 사고를 막는다.
  // 폼도 잠그지만 서버가 authoritative: 우회 제출이 와도 여기서 기존 값으로 되돌린다.
  // ⚠️ '승인'된 강좌만 잠근다 — 초안을 묵혀 두는 사이 첫 회차가 지났다고 잠그면 일정을 다시 못 잡아 영영 제출할 수 없다.
  const started = course.status === "승인" && currentDates.length > 0 && currentDates[0].session_date <= todayKst();

  // 심사 중('신청')·승인된 강좌는 커리큘럼이 완결돼 있어야 한다. 초안·거절은 나눠 채울 수 있다.
  const allowEmptyTopics = course.status === "작성중" || course.status === "거절";

  const v = validatePrepInput(input, { allowPastDates: started, allowEmptyTopics });
  if (v.error || !v.values) return { ok: false, error: v.error ?? "잘못된 요청입니다." };

  if (started && currentDates.length !== v.values.sessions.length) {
    return { ok: false, error: `수업 일자는 정확히 ${PREP_SESSION_COUNT}회여야 합니다.` };
  }

  // 실제로 저장될 값 — **이미 시작된 강좌는 심사받은 조건 전체를 기존 값으로 되돌린다**
  // (승인받은 조건 그대로 끝까지 간다는 규칙. 진행 중 강좌가 재심사로 내려가는 상황 자체를 없앤다).
  // 폼도 잠그지만 서버가 authoritative — 우회 제출이 와도 여기서 무력화된다. 재심사 판정도 이 값으로 한다.
  const nextTitle = started ? course.title : v.values.title;
  const nextLevel = started ? course.level : v.values.level;
  const nextCapacity = started ? course.capacity : v.values.capacity;
  const nextPriceKrw = started ? course.price_krw : v.values.priceKrw;
  const nextStartMin = started ? course.start_min : v.values.startMin;
  const nextDurationMin = started ? course.duration_min : v.values.durationMin;
  const nextDates = started ? currentDates.map((s) => s.session_date) : v.values.sessions.map((s) => s.date);

  // ⚠️ 승인된 강좌라도 **심사 대상 항목이 실제로 바뀐 경우에만** 승인을 해제한다.
  //    소개·회차 주제는 자유 수정 — 오타 하나에 승인이 풀리면 프렌더가 커리큘럼을 다듬지 못한다.
  const materialChanged =
    course.title !== nextTitle ||
    course.level !== nextLevel ||
    course.capacity !== nextCapacity ||
    course.price_krw !== nextPriceKrw ||
    course.start_min !== nextStartMin ||
    course.duration_min !== nextDurationMin ||
    currentDates.map((s) => s.session_date).join(",") !== nextDates.join(",");

  const revoked = course.status === "승인" && materialChanged;

  const { data: updated, error: updateError } = await admin
    .from("prep_courses")
    .update({
      // 소개는 시작 후에도 자유 수정(회차 주제는 아래 RPC에서 교체된다). 나머지는 시작 후면 기존 값이 그대로 들어간다.
      title: nextTitle,
      description: v.values.description,
      level: nextLevel,
      capacity: nextCapacity,
      price_krw: nextPriceKrw,
      start_min: nextStartMin,
      duration_min: nextDurationMin,
      ...(revoked ? { status: "신청", submitted_at: new Date().toISOString(), admin_note: null } : {}),
    })
    .eq("id", courseId)
    .eq("friender_id", userId)
    // 내용과 상태를 한 문장에서 바꾸되, 그 사이 관리자가 상태를 바꿨다면 덮어쓰지 않는다.
    .eq("status", course.status)
    .select("id");
  if (updateError) return { ok: false, error: "강좌 수정 중 문제가 발생했습니다." };
  if (!updated || updated.length === 0) return { ok: false, error: "심사 상태가 바뀌었습니다. 목록을 새로고침해 주세요." };

  // 회차 교체 — 날짜는 nextDates(시작 후면 기존 값), 주제는 항상 새 값.
  const topics = v.values.sessions.map((s) => s.topic);

  // ⚠️ 세션 client로 호출한다 — RPC가 auth.uid()로 소유권을 검증하므로 service_role로 부르면 항상 거부된다.
  // ⚠️ 강좌 UPDATE와 이 RPC는 별개 왕복이다(PostgREST에 트랜잭션이 없다) — 그 사이 관리자가 승인하면
  //    회차만 나중에 바뀔 수 있다. 위 UPDATE에서 상태를 '신청'으로 되돌려 두므로 잘못 승인된 채 굳지는 않는다.
  const supabase = createClient(await cookies());
  const { data: code, error: rpcError } = await supabase.rpc("replace_prep_sessions", {
    p_course_id: courseId,
    p_dates: nextDates,
    p_topics: topics,
  });
  if (rpcError) return { ok: false, error: "수업 일자 저장 중 문제가 발생했습니다." };
  if (String(code ?? "") !== "ok") return { ok: false, error: REPLACE_ERROR[String(code ?? "")] ?? "수업 일자 저장 중 문제가 발생했습니다." };

  // 승인이 해제된 경우에만 관리자에게 다시 알린다(심사 중 강좌를 여러 번 고쳐도 메일이 쌓이지 않게).
  if (revoked) await notifyAdminsOfPrepReview(admin, courseId, true);

  revalidatePrep();
  // reReview로 클라가 토스트 문구를 고른다 — "승인이 해제됐다"고 매번 말하면 거짓이 된다.
  return { ok: true, reReview: revoked };
}

// 승인 요청 — '작성중'·'거절' 강좌를 심사 대기로 올린다.
// ⚠️ 클라 입력이 아니라 **저장된 행**을 검증한다(폼 우회 제출로 미완성 강좌가 심사에 오르지 않도록).
export async function requestPrepReview(id: string): Promise<PrepActionResult> {
  const courseId = String(id ?? "").trim();
  if (!courseId) return { ok: false, error: "잘못된 요청입니다." };

  const userId = await requireFrienderPlus();
  if (!userId) return { ok: false, error: "프렌더 Plus만 승인을 요청할 수 있습니다." };

  // 메일이 딸린 액션이라 연타를 막는다(강좌가 여러 개일 수 있어 넉넉히).
  if (!rateLimit(`prep-review:${userId}`, 10, 10 * 60_000).allowed) {
    return { ok: false, error: "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요." };
  }

  const admin = createAdminClient();
  const { data: cur } = await admin
    .from("prep_courses")
    .select("status, prep_sessions(session_date, topic)")
    .eq("id", courseId)
    .eq("friender_id", userId)
    .maybeSingle();
  const course = cur as { status: PrepStatus; prep_sessions: { session_date: string; topic: string | null }[] | null } | null;
  if (!course) return { ok: false, error: "강좌를 찾을 수 없습니다. 목록을 새로고침해 주세요." };
  if (course.status === "신청") return { ok: false, error: "이미 승인을 요청한 강좌입니다." };
  if (course.status === "승인") return { ok: false, error: "이미 승인된 강좌입니다." };
  if (!PREP_REQUESTABLE_STATUSES.includes(course.status)) return { ok: false, error: "승인을 요청할 수 없는 상태입니다." };

  const sessions = (course.prep_sessions ?? []).slice().sort((a, b) => a.session_date.localeCompare(b.session_date));
  if (sessions.length !== PREP_SESSION_COUNT) return { ok: false, error: `수업 일자는 정확히 ${PREP_SESSION_COUNT}회여야 합니다.` };
  if (sessions.some((s) => !s.topic?.trim())) return { ok: false, error: "각 회차의 주제를 모두 입력한 뒤 승인을 요청해 주세요." };
  // 초안을 묵혀 두는 사이 일정이 지날 수 있다 — 심사·안내 시간이 필요하므로 첫 회차는 미래여야 한다.
  if (sessions[0].session_date <= todayKst()) return { ok: false, error: "첫 수업 일자가 지났습니다. 일정을 수정한 뒤 다시 요청해 주세요." };

  // 개설 때 있었어도 그 뒤 지워졌을 수 있다 — Zoom URL이 없으면 입장시킬 곳이 없다.
  const { data: prof } = await admin.from("profiles").select("zoom_url").eq("id", userId).maybeSingle();
  if (!(prof as { zoom_url?: string | null } | null)?.zoom_url?.trim()) return { ok: false, error: "먼저 프로필에서 Zoom URL을 등록해 주세요." };

  const { data: updated, error } = await admin
    .from("prep_courses")
    .update({ status: "신청", submitted_at: new Date().toISOString(), admin_note: null })
    .eq("id", courseId)
    .eq("friender_id", userId)
    .in("status", PREP_REQUESTABLE_STATUSES)
    .select("id");
  if (error) return { ok: false, error: "승인 요청 중 문제가 발생했습니다." };
  if (!updated || updated.length === 0) return { ok: false, error: "이미 처리된 요청입니다. 목록을 새로고침해 주세요." };

  await notifyAdminsOfPrepReview(admin, courseId, course.status === "거절");

  revalidatePrep();
  return { ok: true };
}

// 관리자 승인 요청 알림 (best-effort) — 실패해도 요청 자체는 유효하다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function notifyAdminsOfPrepReview(admin: any, courseId: string, isResubmit: boolean): Promise<void> {
  try {
    const { data } = await admin
      .from("prep_courses")
      .select(
        "friender_id, friender_name, friender_nickname, title, level, capacity, price_krw, start_min, duration_min, prep_sessions(session_date, topic)",
      )
      .eq("id", courseId)
      .maybeSingle();
    if (!data) return;
    const c = data as {
      friender_id: string;
      friender_name: string | null;
      friender_nickname: string | null;
      title: string;
      level: string;
      capacity: number;
      price_krw: number;
      start_min: number;
      duration_min: number;
      prep_sessions: { session_date: string; topic: string | null }[] | null;
    };

    const sessions = (c.prep_sessions ?? []).slice().sort((a, b) => a.session_date.localeCompare(b.session_date));
    const period = sessions.length > 0 ? `${fmtDateKo(sessions[0].session_date)} ~ ${fmtDateKo(sessions[sessions.length - 1].session_date)}` : "-";
    const { data: userData } = await admin.auth.admin.getUserById(c.friender_id);

    await sendPrepCourseReviewRequestNotification(await getAdminEmails(), {
      frienderName: c.friender_name ?? "(이름 없음)",
      nickname: c.friender_nickname ?? "",
      email: userData?.user?.email ?? "",
      title: c.title,
      level: roomLevelLabelKo(c.level),
      capacity: c.capacity,
      priceKrw: c.price_krw,
      period: `${period} (${sessions.length}회)`,
      time: `${fmtTime(c.start_min)}~${fmtRoomEnd(c.start_min + c.duration_min)} (${c.duration_min}분)`,
      firstTopic: sessions[0]?.topic?.trim() ?? "",
      requestedAt: new Date().toISOString(),
      isResubmit,
    });
  } catch (err) {
    console.error("[prep] 관리자 승인요청 알림 발송 실패:", err);
  }
}

export async function deletePrepCourse(id: string): Promise<PrepActionResult> {
  const courseId = String(id ?? "").trim();
  if (!courseId) return { ok: false, error: "잘못된 요청입니다." };

  const userId = await requireFrienderPlus();
  if (!userId) return { ok: false, error: "프렌더 Plus만 강좌를 삭제할 수 있습니다." };

  // ⏳ 수강신청·결제 동선이 붙으면 여기에 "수강생이 있으면 삭제 금지" 가드를 추가한다
  //    (연습방 deleteRoom의 countParticipants와 같은 모양).
  const admin = createAdminClient();
  const { error } = await admin.from("prep_courses").delete().eq("id", courseId).eq("friender_id", userId);
  if (error) return { ok: false, error: "삭제 중 문제가 발생했습니다." };

  revalidatePrep();
  return { ok: true };
}
