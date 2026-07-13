import "server-only";

import { createAdminClient } from "@/utils/supabase/admin";
import { deriveBookedSlots, lessonEndMin, summarizeWeekdays, isValidSlot, dowOf, TOTAL_SESSIONS, type BookedSlot, type Slot } from "@/lib/availability";
import { kstDateMinToMs } from "@/lib/classtime";
import { loadEndedEnrollmentIds } from "@/lib/booking";
import type { CurrentTeacher, TeacherClassItem } from "@/components/admin/TeacherRequestsManager";
import type { AdminSession } from "@/components/admin/ClassWeekGrid";

// 센터 스코프 강사 디렉토리 — admin teacher-requests 페이지의 CurrentTeacher 조립을 재사용(센터 소속 강사만).
// 프로필·주간 가용·진행 중 강좌(승인/결제대기/결제완료, 종료분 제외) 집계 포함. 가드(requireCenterManager) 후 service_role로 호출.
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
    .select("id, teacher_id, course, course_title, slots, status, start_date, total_sessions, student_name, student_english_name")
    .in("teacher_id", teacherIds)
    .in("status", ["승인", "결제대기", "결제완료"]);
  const ended = await loadEndedEnrollmentIds(admin, teacherIds);
  const rowsByTeacher = new Map<string, NonNullable<typeof enrollRows>>();
  for (const r of enrollRows ?? []) {
    if (r.status === "결제완료" && ended.has(r.id)) continue;
    const list = rowsByTeacher.get(r.teacher_id) ?? [];
    list.push(r);
    rowsByTeacher.set(r.teacher_id, list);
  }
  rowsByTeacher.forEach((rs, tid) => bookedByTeacher.set(tid, deriveBookedSlots(rs)));

  const { data: clsRows } = await admin
    .from("classes")
    .select("enrollment_id, session_date, start_min, end_min, status, is_makeup")
    .in("teacher_id", teacherIds);
  const now = Date.now();
  const aggByEnrollment = new Map<string, { total: number; done: number; nextDate: string | null; nextMin: number | null }>();
  for (const c of clsRows ?? []) {
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

  rowsByTeacher.forEach((rs, tid) => {
    const items: TeacherClassItem[] = rs.map((r) => {
      const agg = aggByEnrollment.get(r.id);
      return {
        enrollmentId: r.id,
        course: r.course,
        courseTitle: r.course_title,
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
      "enrollment_id, teacher_id, course_title, teacher_name, student_name, student_english_name, session_date, start_min, end_min, status, is_makeup, conducted_at, conducted_override, teacher_reassigned_at",
    )
    .in("teacher_id", teacherIds)
    .neq("status", "취소")
    .order("session_date", { ascending: true });
  const rows = (clsRows ?? []) as {
    enrollment_id: string;
    teacher_id: string;
    course_title: string;
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
  }[];
  if (rows.length === 0) return [];

  // 주간 요일 요약 — 현재 템플릿(enrollments.slots) 우선, 비면 클래스 session_date에서 파생.
  const enrollmentIds = Array.from(new Set(rows.map((r) => r.enrollment_id)));
  const slotsByEnrollment = new Map<string, Slot[]>();
  const { data: enrRows } = await admin.from("enrollments").select("id, slots").in("id", enrollmentIds);
  for (const e of (enrRows ?? []) as { id: string; slots: unknown }[]) {
    const s = (Array.isArray(e.slots) ? e.slots : []).filter(isValidSlot).map((x) => ({ day: Number(x.day), min: Number(x.min) }));
    slotsByEnrollment.set(e.id, s);
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
  for (const id of enrollmentIds) {
    const s = slotsByEnrollment.get(id) ?? [];
    const src = s.length ? s : Array.from((slotSetByEnr.get(id) ?? new Map<string, Slot>()).values());
    weekdaysByEnrollment.set(id, summarizeWeekdays(src, true));
  }

  return rows.map((r) => ({
    enrollmentId: r.enrollment_id,
    courseTitle: r.course_title,
    weekdays: weekdaysByEnrollment.get(r.enrollment_id) ?? "",
    teacherName: r.teacher_name,
    centerName: centerNameByTeacher.get(r.teacher_id) ?? null,
    studentName: r.student_name,
    studentEnglishName: r.student_english_name,
    sessionDate: r.session_date,
    startMin: r.start_min,
    endMin: r.end_min,
    isMakeup: r.is_makeup,
    conductedAt: r.conducted_at,
    conductedOverride: r.conducted_override,
    teacherReassignedAt: r.teacher_reassigned_at,
  }));
}
