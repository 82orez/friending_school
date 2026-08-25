import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";
import { kstDateMinToMs } from "@/lib/classtime";

// 프렙 회차(입장·출결) 조회 계층. src/lib/classroom.ts(loadClasses/mapClassRows)와 같은 역할:
// **startMs/endMs를 서버에서 미리 계산**해 클라는 숫자만 비교하게 한다.
//
// ⚠️ 전부 service_role로 읽는다. prep_sessions의 SELECT 정책은 _select_own(개설자)과
//    _select_public(course.status='승인')뿐이라, 프렌더가 승인된 강좌를 고쳐 승인이 풀리는 순간
//    수강생 세션 client에서 회차가 통째로 사라진다. 자격은 여기서 prep_enrollments로 직접 확인한다
//    (수강신청 내역이 임베드 대신 스냅샷을 쓰는 것과 같은 이유·같은 방어).

export type PrepSessionItem = {
  id: string;
  sessionNo: number;
  sessionDate: string; // KST YYYY-MM-DD
  topic: string | null;
  startMs: number; // 회차 시작(절대 ms) — 시각은 강좌 단위(start_min)라 날짜와 합성한다
  endMs: number; // ⚠️ start_min + duration_min. lessonEndMin(정규 수업 전용 30→25분)은 쓰지 않는다
  enteredAt: string | null; // 학생=prep_attendance.entered_at, 프렌더=prep_sessions.host_entered_at
  attendees?: number; // 프렌더 화면 전용 — 그 회차에 입장한 수강생 수
};

export type PrepCourseSessions = {
  courseId: string;
  courseTitle: string;
  // 개설자 표시 스냅샷 — 화면에서 frienderLabel(name, nickname)로 조립한다(admin·프렙 공통 규칙).
  frienderName: string | null;
  frienderNickname: string | null;
  startMin: number;
  durationMin: number;
  sessions: PrepSessionItem[]; // 회차 순(session_no asc)
};

type SessionRow = {
  id: string;
  course_id: string;
  session_no: number;
  session_date: string;
  topic: string | null;
  host_entered_at: string | null;
};

type CourseRow = {
  id: string;
  title: string;
  friender_name: string | null;
  friender_nickname: string | null;
  start_min: number;
  duration_min: number;
};

const SESSION_SELECT = "id, course_id, session_no, session_date, topic, host_entered_at";

// 회차 행 + 강좌 시각 → 화면용 아이템. 시각이 강좌 단위라 날짜별로 합성한다.
function mapSessions(
  rows: SessionRow[],
  startMin: number,
  durationMin: number,
  enteredAtOf: (row: SessionRow) => string | null,
  attendeesOf?: (row: SessionRow) => number,
): PrepSessionItem[] {
  return rows
    .slice()
    .sort((a, b) => a.session_no - b.session_no)
    .map((r) => ({
      id: r.id,
      sessionNo: r.session_no,
      sessionDate: r.session_date,
      topic: r.topic,
      startMs: kstDateMinToMs(r.session_date, startMin),
      // ⚠️ 자정을 넘기는 회차(23:30 + 120분)를 놓치지 않으려면 반드시 분을 더해 절대 ms로 환산한다.
      endMs: kstDateMinToMs(r.session_date, startMin + durationMin),
      enteredAt: enteredAtOf(r),
      ...(attendeesOf ? { attendees: attendeesOf(r) } : {}),
    }));
}

// 수강생 화면 — '수강확정' 강좌의 회차 + 내 출결.
// 반환은 course_id 기준 맵(마이페이지가 신청 카드마다 붙여 쓴다).
export async function loadPrepSessionsForStudent(userId: string): Promise<Record<string, PrepCourseSessions>> {
  const admin = createAdminClient();

  // 자격은 여기서 확정한다 — '입금대기'는 회차를 보여 주지 않는다(입장도 서버가 거부한다).
  const { data: enrolls } = await admin.from("prep_enrollments").select("course_id").eq("user_id", userId).eq("status", "수강확정");
  const courseIds = Array.from(new Set(((enrolls ?? []) as { course_id: string }[]).map((e) => e.course_id)));
  if (courseIds.length === 0) return {};

  // 시각·제목은 강좌 행의 현재 값을 쓴다(신청 스냅샷은 카드 상단 정보용).
  const { data: courses } = await admin
    .from("prep_courses")
    .select("id, title, friender_name, friender_nickname, start_min, duration_min")
    .in("id", courseIds);
  const { data: rows } = await admin.from("prep_sessions").select(SESSION_SELECT).in("course_id", courseIds);
  const sessionRows = (rows ?? []) as SessionRow[];

  // 내 출결 — 회차 id 기준.
  const enteredBySession = new Map<string, string>();
  if (sessionRows.length > 0) {
    const { data: att } = await admin
      .from("prep_attendance")
      .select("session_id, entered_at")
      .eq("user_id", userId)
      .in(
        "session_id",
        sessionRows.map((s) => s.id),
      );
    for (const a of (att ?? []) as { session_id: string; entered_at: string }[]) enteredBySession.set(a.session_id, a.entered_at);
  }

  const out: Record<string, PrepCourseSessions> = {};
  for (const c of (courses ?? []) as CourseRow[]) {
    out[c.id] = {
      courseId: c.id,
      courseTitle: c.title,
      frienderName: c.friender_name,
      frienderNickname: c.friender_nickname,
      startMin: c.start_min,
      durationMin: c.duration_min,
      sessions: mapSessions(
        sessionRows.filter((r) => r.course_id === c.id),
        c.start_min,
        c.duration_min,
        (r) => enteredBySession.get(r.id) ?? null,
      ),
    };
  }
  return out;
}

// 프렌더 화면 — 내가 개설한 강좌의 회차 + 내 호스트 입장 + 회차별 수강생 출석 수.
// ⚠️ 출석 신원은 노출하지 않는다(prep_attendance RLS가 _select_own인 것과 같은 정책) — 수만 센다.
export async function loadPrepSessionsForFriender(userId: string, courseIds: string[]): Promise<Record<string, PrepCourseSessions>> {
  if (courseIds.length === 0) return {};
  const admin = createAdminClient();

  // ⚠️ 소유권은 쿼리에서 강제한다 — prep_courses_select_public이 permissive라 OR로 합쳐진다.
  const { data: courses } = await admin
    .from("prep_courses")
    .select("id, title, friender_name, friender_nickname, start_min, duration_min")
    .eq("friender_id", userId)
    .in("id", courseIds);
  const owned = (courses ?? []) as CourseRow[];
  if (owned.length === 0) return {};

  const ownedIds = owned.map((c) => c.id);
  const { data: rows } = await admin.from("prep_sessions").select(SESSION_SELECT).in("course_id", ownedIds);
  const sessionRows = (rows ?? []) as SessionRow[];

  const attendeesBySession = new Map<string, number>();
  if (sessionRows.length > 0) {
    const { data: att } = await admin
      .from("prep_attendance")
      .select("session_id")
      .in(
        "session_id",
        sessionRows.map((s) => s.id),
      );
    for (const a of (att ?? []) as { session_id: string }[]) attendeesBySession.set(a.session_id, (attendeesBySession.get(a.session_id) ?? 0) + 1);
  }

  const out: Record<string, PrepCourseSessions> = {};
  for (const c of owned) {
    out[c.id] = {
      courseId: c.id,
      courseTitle: c.title,
      frienderName: c.friender_name,
      frienderNickname: c.friender_nickname,
      startMin: c.start_min,
      durationMin: c.duration_min,
      sessions: mapSessions(
        sessionRows.filter((r) => r.course_id === c.id),
        c.start_min,
        c.duration_min,
        (r) => r.host_entered_at,
        (r) => attendeesBySession.get(r.id) ?? 0,
      ),
    };
  }
  return out;
}

// 오늘 수업(마이페이지 상단 배너) — 수강확정 강좌 + 내가 개설한 승인 강좌 양쪽.
// 배너는 강좌 카드 밖에서 단독으로 뜨므로 표시에 필요한 시각·강좌 정보를 회차에 실어 보낸다.
export type TodayPrepSession = PrepSessionItem & {
  courseTitle: string;
  isHost: boolean;
  total: number;
  startMin: number;
  durationMin: number;
};

export async function loadTodayPrepSessions(userId: string, todayKstDate: string): Promise<TodayPrepSession[]> {
  const admin = createAdminClient();

  const { data: enrolls } = await admin.from("prep_enrollments").select("course_id").eq("user_id", userId).eq("status", "수강확정");
  const studentIds = Array.from(new Set(((enrolls ?? []) as { course_id: string }[]).map((e) => e.course_id)));

  const { data: mine } = await admin.from("prep_courses").select("id").eq("friender_id", userId).eq("status", "승인");
  const hostIds = ((mine ?? []) as { id: string }[]).map((c) => c.id);

  const allIds = Array.from(new Set([...studentIds, ...hostIds]));
  if (allIds.length === 0) return [];

  const { data: rows } = await admin.from("prep_sessions").select(SESSION_SELECT).in("course_id", allIds).eq("session_date", todayKstDate);
  const sessionRows = (rows ?? []) as SessionRow[];
  if (sessionRows.length === 0) return [];

  const { data: courses } = await admin.from("prep_courses").select("id, title, start_min, duration_min, session_count").in("id", allIds);
  const byId = new Map(
    ((courses ?? []) as { id: string; title: string; start_min: number; duration_min: number; session_count: number }[]).map((c) => [c.id, c]),
  );

  const hostSet = new Set(hostIds);
  return sessionRows
    .map((r) => {
      const c = byId.get(r.course_id);
      if (!c) return null;
      return {
        id: r.id,
        sessionNo: r.session_no,
        sessionDate: r.session_date,
        topic: r.topic,
        startMs: kstDateMinToMs(r.session_date, c.start_min),
        endMs: kstDateMinToMs(r.session_date, c.start_min + c.duration_min),
        enteredAt: null, // 배너는 출결을 보여 주지 않는다(입장 동선만)
        courseTitle: c.title,
        isHost: hostSet.has(r.course_id),
        total: c.session_count,
        startMin: c.start_min,
        durationMin: c.duration_min,
      } as TodayPrepSession;
    })
    .filter((s): s is TodayPrepSession => s !== null)
    .sort((a, b) => a.startMs - b.startMs);
}
