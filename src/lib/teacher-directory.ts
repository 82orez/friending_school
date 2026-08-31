import "server-only";

import { createAdminClient } from "@/utils/supabase/admin";
import {
  deriveBookedSlots,
  lessonEndMin,
  summarizeWeekdays,
  scheduleDateRange,
  isValidSlot,
  subtractSlots,
  dowOf,
  TOTAL_SESSIONS,
  type BookedSlot,
  type Slot,
} from "@/lib/availability";
import { kstDateMinToMs } from "@/lib/classtime";
import { ACTIVE_BOOKING_STATUSES, loadBookedSlotsByTeacher, loadEndedEnrollmentIds } from "@/lib/booking";
import type { CurrentTeacher, TeacherClassItem, TeacherCoverItem } from "@/components/admin/TeacherRequestsManager";
import type { AdminSession } from "@/components/admin/ClassWeekGrid";
import type { CenterTeacher } from "@/components/center/ReassignModal";

// 「수업 보기」 모달의 과정 집계 + 대체 회차 파생에 필요한 classes 컬럼(admin·center 공용).
export const TEACHER_CLASS_SELECT =
  "id, enrollment_id, teacher_id, original_teacher_id, course, course_title, course_english_title, teacher_name, student_name, student_english_name, session_no, session_date, start_min, end_min, status, is_makeup";

export type TeacherClassRow = {
  id: string;
  enrollment_id: string;
  teacher_id: string;
  original_teacher_id: string | null;
  course: string;
  course_title: string;
  course_english_title: string | null;
  teacher_name: string | null;
  student_name: string | null;
  student_english_name: string | null;
  session_no: number;
  session_date: string;
  start_min: number;
  end_min: number;
  status: string;
  is_makeup: boolean;
};

// classes를 teacher_id 또는 original_teacher_id로 조회하기 위한 PostgREST or 필터(1회성 대체로 넘어간 회차까지 포함).
export function teacherClassesOrFilter(teacherIds: string[]): string {
  const ids = teacherIds.join(",");
  return `teacher_id.in.(${ids}),original_teacher_id.in.(${ids})`;
}

// 1회성 강사 대체로 얽힌 앞으로의 회차를 강사별로 파생 — 대타(covering) + 넘긴 회차(away).
// classroom.ts mapClassRows의 coveringForOther/reassignedAway 판정과 동일 규칙.
export function buildCoverSessions(rows: TeacherClassRow[], teacherIds: string[], nameById: Map<string, string>): Map<string, TeacherCoverItem[]> {
  const scope = new Set(teacherIds);
  const byTeacher = new Map<string, TeacherCoverItem[]>();
  const now = Date.now();

  const push = (tid: string, item: TeacherCoverItem) => {
    const list = byTeacher.get(tid) ?? [];
    list.push(item);
    byTeacher.set(tid, list);
  };

  for (const c of rows) {
    if (c.status === "취소") continue;
    if (!c.original_teacher_id || c.original_teacher_id === c.teacher_id) continue;
    // 앞으로의 회차만(레슨 종료 시각 기준 — 내 강의실 예정/지난 전환과 동일).
    if (kstDateMinToMs(c.session_date, lessonEndMin(c.end_min)) < now) continue;

    const base = {
      classId: c.id,
      enrollmentId: c.enrollment_id,
      course: c.course,
      courseTitle: c.course_title,
      courseEnglishTitle: c.course_english_title,
      studentName: c.student_name ?? "-",
      studentEnglishName: c.student_english_name,
      sessionNo: c.session_no,
      sessionDate: c.session_date,
      startMin: c.start_min,
      endMin: c.end_min,
      isMakeup: c.is_makeup,
    };
    if (scope.has(c.teacher_id)) push(c.teacher_id, { ...base, kind: "covering", counterpartName: nameById.get(c.original_teacher_id) ?? null });
    if (scope.has(c.original_teacher_id)) push(c.original_teacher_id, { ...base, kind: "away", counterpartName: c.teacher_name });
  }

  byTeacher.forEach((list) =>
    list.sort((a, b) => (a.sessionDate !== b.sessionDate ? a.sessionDate.localeCompare(b.sessionDate) : a.startMin - b.startMin)),
  );
  return byTeacher;
}

// 센터 스코프 강사 디렉토리 — admin teacher-requests 페이지의 CurrentTeacher 조립을 재사용(센터 소속 강사만).
// 프로필·주간 가용·진행 중 강좌 집계 포함. 가드(requireCenterManager) 후 service_role로 호출.
// 점유(bookedSlots)는 진행중 전부, 「수업 보기」 목록은 '신청' 제외 — 종료된 '결제완료'는 양쪽 다 해제.
export async function loadCenterTeachers(admin: ReturnType<typeof createAdminClient>, centerIds: string[]): Promise<CurrentTeacher[]> {
  if (centerIds.length === 0) return [];

  const { data: teacherProfiles } = await admin
    .from("profiles")
    .select("id, first_name, last_name, avatar_url, zoom_url, bio, experience, phone, nationality, gender, center_id")
    .eq("role", "teacher")
    .in("center_id", centerIds);
  const rows = (teacherProfiles ?? []) as {
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    zoom_url: string | null;
    bio: string | null;
    experience: string | null;
    phone: string | null;
    nationality: string | null;
    gender: string | null;
    center_id: string | null;
  }[];
  const teacherIds = rows.map((t) => t.id);
  if (teacherIds.length === 0) return [];

  // 이메일(listUsers) + 센터명 매핑.
  const { data: usersData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const emailById = new Map((usersData?.users ?? []).map((u) => [u.id, u.email ?? "(이메일 없음)"]));
  const { data: centersData } = await admin.from("centers").select("id, name").in("id", centerIds);
  const centerNameById = new Map(((centersData ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));

  // 주간 가용.
  const slotsByTeacher = new Map<string, { day: number; min: number }[]>();
  const { data: slotRows } = await admin.from("teacher_availability").select("teacher_id, day_of_week, start_min").in("teacher_id", teacherIds);
  for (const r of (slotRows ?? []) as { teacher_id: string; day_of_week: number; start_min: number }[]) {
    const list = slotsByTeacher.get(r.teacher_id) ?? [];
    list.push({ day: r.day_of_week, min: r.start_min });
    slotsByTeacher.set(r.teacher_id, list);
  }

  // 예약(그리드 오버레이) + 진행 중 강좌.
  const bookedByTeacher = new Map<string, BookedSlot[]>();
  const classesByTeacher = new Map<string, TeacherClassItem[]>();
  const { data: enrollRows } = await admin
    .from("enrollments")
    .select(
      "id, teacher_id, course, course_title, course_english_title, slots, status, start_date, total_sessions, student_name, student_english_name",
    )
    .in("teacher_id", teacherIds)
    // ⚠️ 한 쿼리 두 용도: 그리드 오버레이는 '신청'까지 점유(강사 화면과 일치), 아래 「수업 보기」 목록에서는 '신청'을 걸러낸다.
    .in("status", ACTIVE_BOOKING_STATUSES as unknown as string[]);
  const ended = await loadEndedEnrollmentIds(admin, teacherIds);
  const rowsByTeacher = new Map<string, NonNullable<typeof enrollRows>>();
  for (const r of enrollRows ?? []) {
    if (r.status === "결제완료" && ended.has(r.id)) continue;
    const list = rowsByTeacher.get(r.teacher_id) ?? [];
    list.push(r);
    rowsByTeacher.set(r.teacher_id, list);
  }
  rowsByTeacher.forEach((rs, tid) => bookedByTeacher.set(tid, deriveBookedSlots(rs)));

  // 대체로 스코프 밖 강사에게 넘어간 회차도 포함(집계 누락 방지 + 대체 회차 파생).
  const { data: clsRows } = await admin.from("classes").select(TEACHER_CLASS_SELECT).or(teacherClassesOrFilter(teacherIds));
  const classRows = (clsRows ?? []) as TeacherClassRow[];
  const now = Date.now();
  const aggByEnrollment = new Map<string, { total: number; done: number; nextDate: string | null; nextMin: number | null }>();
  for (const c of classRows) {
    const a = aggByEnrollment.get(c.enrollment_id) ?? { total: 0, done: 0, nextDate: null, nextMin: null };
    if (c.status !== "취소") {
      if (!c.is_makeup) a.total += 1;
      const endMs = kstDateMinToMs(c.session_date, lessonEndMin(c.end_min));
      if (endMs < now) {
        a.done += 1;
      } else if (a.nextDate === null || c.session_date < a.nextDate || (c.session_date === a.nextDate && c.start_min < (a.nextMin ?? Infinity))) {
        a.nextDate = c.session_date;
        a.nextMin = c.start_min;
      }
    }
    aggByEnrollment.set(c.enrollment_id, a);
  }

  // 대체 회차(대타/넘긴 회차) — 원 강사가 센터 밖일 수 있어 이름은 누락분만 보강 조회.
  const nameById = new Map(rows.map((p) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ").trim()]));
  const missingIds = Array.from(new Set(classRows.map((c) => c.original_teacher_id).filter((id): id is string => !!id && !nameById.has(id))));
  if (missingIds.length > 0) {
    const { data: extra } = await admin.from("profiles").select("id, first_name, last_name").in("id", missingIds);
    for (const p of (extra ?? []) as { id: string; first_name: string | null; last_name: string | null }[]) {
      nameById.set(p.id, [p.first_name, p.last_name].filter(Boolean).join(" ").trim());
    }
  }
  const coverByTeacher = buildCoverSessions(classRows, teacherIds, nameById);

  rowsByTeacher.forEach((rs, tid) => {
    // '신청'은 그리드 점유 표시 전용 — 아직 강사 승인 전이라 「수업 보기」 목록에는 넣지 않는다.
    const items: TeacherClassItem[] = rs
      .filter((r) => r.status !== "신청")
      .map((r) => {
        const agg = aggByEnrollment.get(r.id);
        return {
          enrollmentId: r.id,
          course: r.course,
          courseTitle: r.course_title,
          courseEnglishTitle: r.course_english_title,
          studentName: r.student_name,
          studentEnglishName: r.student_english_name,
          status: r.status,
          slots: (r.slots ?? []) as { day: number; min: number }[],
          startDate: r.start_date,
          totalSessions: r.total_sessions ?? TOTAL_SESSIONS,
          total: agg?.total ?? 0,
          done: agg?.done ?? 0,
          nextDate: agg?.nextDate ?? null,
          nextMin: agg?.nextMin ?? null,
        };
      });
    items.sort((a, b) => {
      const an = a.nextDate ?? "9999-99-99";
      const bn = b.nextDate ?? "9999-99-99";
      if (an !== bn) return an < bn ? -1 : 1;
      return (a.startDate ?? "").localeCompare(b.startDate ?? "");
    });
    classesByTeacher.set(tid, items);
  });

  return rows
    .map((p) => ({
      id: p.id,
      email: emailById.get(p.id) ?? "(이메일 없음)",
      name: [p.first_name, p.last_name].filter(Boolean).join(" "),
      phone: p.phone,
      nationality: p.nationality,
      gender: p.gender,
      centerId: p.center_id,
      centerName: p.center_id ? (centerNameById.get(p.center_id) ?? null) : null,
      customPrice: null,
      customCurrency: null,
      bio: p.bio,
      experience: p.experience,
      zoomUrl: p.zoom_url,
      avatarUrl: p.avatar_url,
      slots: slotsByTeacher.get(p.id) ?? [],
      bookedSlots: bookedByTeacher.get(p.id) ?? [],
      classes: classesByTeacher.get(p.id) ?? [],
      coverSessions: coverByTeacher.get(p.id) ?? [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

// 센터 스코프 주간 타임테이블용 세션 — admin classes 페이지의 AdminSession 조립을 소속 강사로 한정.
// 취소 회차 제외(보강·과거 포함=격자 주 네비). weekdays=enrollments.slots→summarizeWeekdays(비면 클래스 파생 폴백).
export async function loadCenterSessions(admin: ReturnType<typeof createAdminClient>, centerIds: string[]): Promise<AdminSession[]> {
  if (centerIds.length === 0) return [];

  const { data: profRows } = await admin.from("profiles").select("id, center_id").eq("role", "teacher").in("center_id", centerIds);
  const teacherRows = (profRows ?? []) as { id: string; center_id: string | null }[];
  const teacherIds = teacherRows.map((t) => t.id);
  if (teacherIds.length === 0) return [];

  const { data: centersData } = await admin.from("centers").select("id, name").in("id", centerIds);
  const centerNameById = new Map(((centersData ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const centerNameByTeacher = new Map(teacherRows.map((t) => [t.id, t.center_id ? (centerNameById.get(t.center_id) ?? null) : null]));

  const { data: clsRows } = await admin
    .from("classes")
    .select(
      "id, enrollment_id, teacher_id, session_no, course, course_title, course_english_title, teacher_name, student_name, student_english_name, session_date, start_min, end_min, status, is_makeup, conducted_at, conducted_override, teacher_reassigned_at, feedback, feedback_at",
    )
    .in("teacher_id", teacherIds)
    .neq("status", "취소")
    .order("session_date", { ascending: true });
  const rows = (clsRows ?? []) as {
    id: string;
    enrollment_id: string;
    teacher_id: string;
    session_no: number;
    course: string;
    course_title: string;
    course_english_title: string | null;
    teacher_name: string | null;
    student_name: string | null;
    student_english_name: string | null;
    session_date: string;
    start_min: number;
    end_min: number;
    is_makeup: boolean;
    conducted_at: string | null;
    conducted_override: boolean | null;
    teacher_reassigned_at: string | null;
    feedback: string | null;
    feedback_at: string | null;
  }[];
  if (rows.length === 0) return [];

  // 주간 요일 요약 — 현재 템플릿(enrollments.slots) 우선, 비면 클래스 session_date에서 파생.
  const enrollmentIds = Array.from(new Set(rows.map((r) => r.enrollment_id)));
  const slotsByEnrollment = new Map<string, Slot[]>();
  const startDateByEnrollment = new Map<string, string | null>();
  const totalByEnrollment = new Map<string, number>();
  const { data: enrRows } = await admin.from("enrollments").select("id, slots, start_date, total_sessions").in("id", enrollmentIds);
  for (const e of (enrRows ?? []) as { id: string; slots: unknown; start_date: string | null; total_sessions: number | null }[]) {
    const s = (Array.isArray(e.slots) ? e.slots : []).filter(isValidSlot).map((x) => ({ day: Number(x.day), min: Number(x.min) }));
    slotsByEnrollment.set(e.id, s);
    startDateByEnrollment.set(e.id, e.start_date);
    totalByEnrollment.set(e.id, e.total_sessions ?? TOTAL_SESSIONS);
  }
  const slotSetByEnr = new Map<string, Map<string, Slot>>();
  for (const r of rows) {
    if (r.is_makeup) continue;
    const day = dowOf(r.session_date);
    const m = slotSetByEnr.get(r.enrollment_id) ?? new Map<string, Slot>();
    m.set(`${day}-${r.start_min}`, { day, min: r.start_min });
    slotSetByEnr.set(r.enrollment_id, m);
  }
  const weekdaysByEnrollment = new Map<string, string>();
  const periodByEnrollment = new Map<string, string>();
  for (const id of enrollmentIds) {
    const s = slotsByEnrollment.get(id) ?? [];
    const src = s.length ? s : Array.from((slotSetByEnr.get(id) ?? new Map<string, Slot>()).values());
    weekdaysByEnrollment.set(id, summarizeWeekdays(src, true));
    periodByEnrollment.set(id, scheduleDateRange(startDateByEnrollment.get(id), src, totalByEnrollment.get(id) ?? TOTAL_SESSIONS));
  }

  return rows.map((r) => ({
    enrollmentId: r.enrollment_id,
    classId: r.id,
    teacherId: r.teacher_id,
    sessionNo: r.session_no,
    course: r.course,
    courseTitle: r.course_title,
    courseEnglishTitle: r.course_english_title,
    weekdays: weekdaysByEnrollment.get(r.enrollment_id) ?? "",
    teacherName: r.teacher_name,
    centerName: centerNameByTeacher.get(r.teacher_id) ?? null,
    studentName: r.student_name,
    studentEnglishName: r.student_english_name,
    sessionDate: r.session_date,
    startMin: r.start_min,
    endMin: r.end_min,
    period: periodByEnrollment.get(r.enrollment_id) ?? "-",
    totalSessions: totalByEnrollment.get(r.enrollment_id) ?? TOTAL_SESSIONS,
    isMakeup: r.is_makeup,
    conductedAt: r.conducted_at,
    conductedOverride: r.conducted_override,
    teacherReassignedAt: r.teacher_reassigned_at,
    feedback: r.feedback,
    feedbackAt: r.feedback_at,
  }));
}

// 대체 피커 후보용 소속 센터 강사 카드(이름·국적·성별·아바타·주간 가용).
export async function loadCenterTeacherCards(admin: ReturnType<typeof createAdminClient>, centerIds: string[]): Promise<CenterTeacher[]> {
  if (centerIds.length === 0) return [];
  const { data: profRows } = await admin
    .from("profiles")
    .select("id, first_name, last_name, avatar_url, nationality, gender")
    .eq("role", "teacher")
    .in("center_id", centerIds);
  const teacherRows = (profRows ?? []) as {
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    nationality: string | null;
    gender: string | null;
  }[];
  const teacherIds = teacherRows.map((t) => t.id);
  if (teacherIds.length === 0) return [];

  const slotsByTeacher = new Map<string, Slot[]>();
  const { data: slotRows } = await admin.from("teacher_availability").select("teacher_id, day_of_week, start_min").in("teacher_id", teacherIds);
  for (const s of (slotRows ?? []) as { teacher_id: string; day_of_week: number; start_min: number }[]) {
    const list = slotsByTeacher.get(s.teacher_id) ?? [];
    list.push({ day: s.day_of_week, min: s.start_min });
    slotsByTeacher.set(s.teacher_id, list);
  }

  // 진행중 예약을 차감해 "실제로 비어 있는" 슬롯만 노출 — ReassignModal이 이 slots로 대체 후보를 거른다.
  // (서버 reassignClassCore는 classes 충돌만 보므로, 아직 classes가 없는 신청/승인/결제대기 건은 여기서만 걸러진다.)
  const booked = await loadBookedSlotsByTeacher(admin, teacherIds);

  return teacherRows
    .map((t) => ({
      id: t.id,
      name: [t.first_name, t.last_name].filter(Boolean).join(" ").trim() || "강사",
      nationality: t.nationality,
      gender: t.gender,
      avatarUrl: t.avatar_url,
      slots: subtractSlots(slotsByTeacher.get(t.id) ?? [], booked.get(t.id) ?? []),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}
