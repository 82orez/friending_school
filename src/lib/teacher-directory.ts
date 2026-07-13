import "server-only";

import { createAdminClient } from "@/utils/supabase/admin";
import { deriveBookedSlots, lessonEndMin, type BookedSlot } from "@/lib/availability";
import { kstDateMinToMs } from "@/lib/classtime";
import { loadEndedEnrollmentIds } from "@/lib/booking";
import type { CurrentTeacher, TeacherClassItem } from "@/components/admin/TeacherRequestsManager";

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
    .select("id, teacher_id, course, course_title, slots, status, start_date, student_name, student_english_name")
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
