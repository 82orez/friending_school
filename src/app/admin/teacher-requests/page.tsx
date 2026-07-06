import { createAdminClient } from "@/utils/supabase/admin";
import TeacherRequestsManager, { type TeacherApplication, type CurrentTeacher, type TeacherClassItem } from "@/components/admin/TeacherRequestsManager";
import { deriveBookedSlots, lessonEndMin, type BookedSlot } from "@/lib/availability";
import { kstDateMinToMs } from "@/lib/classtime";
import { loadEndedEnrollmentIds } from "@/lib/booking";

const STATUS_ORDER: Record<string, number> = { 신청: 0, 거절: 1, 승인: 2 };

export default async function AdminTeacherRequestsPage() {
  const admin = createAdminClient();

  const { data: usersData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const emailById = new Map((usersData?.users ?? []).map((u) => [u.id, u.email ?? "(이메일 없음)"]));

  // 센터 id→이름 매핑(신청서·프로필의 center_id 표시용).
  const { data: centersData } = await admin.from("centers").select("id, name");
  const centerNameById = new Map(((centersData ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));

  const { data: appsData } = await admin
    .from("teacher_applications")
    .select("id, user_id, name, phone, nationality, gender, center_id, bio, experience, zoom_url, avatar_url, status, admin_note, created_at")
    .order("created_at", { ascending: false });

  const applications: TeacherApplication[] = (
    (appsData ?? []) as (Omit<TeacherApplication, "email" | "center_name"> & { center_id: string | null })[]
  )
    .map((a) => ({
      ...a,
      email: emailById.get(a.user_id) ?? "(이메일 없음)",
      center_name: a.center_id ? (centerNameById.get(a.center_id) ?? null) : null,
    }))
    // 신청(미처리) → 거절 → 승인 순, 같은 그룹 내 최신순(원본이 created desc)
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));

  const { data: teacherProfiles } = await admin
    .from("profiles")
    .select("id, first_name, last_name, avatar_url, zoom_url, bio, experience, phone, nationality, gender, center_id")
    .eq("role", "teacher");

  // 현재 강사 가용 시간 일괄 조회 후 teacher_id별 그룹핑.
  const teacherIds = (teacherProfiles ?? []).map((t: { id: string }) => t.id);
  const slotsByTeacher = new Map<string, { day: number; min: number }[]>();
  if (teacherIds.length > 0) {
    const { data: slotRows } = await admin.from("teacher_availability").select("teacher_id, day_of_week, start_min").in("teacher_id", teacherIds);
    for (const r of slotRows ?? []) {
      const list = slotsByTeacher.get(r.teacher_id) ?? [];
      list.push({ day: r.day_of_week, min: r.start_min });
      slotsByTeacher.set(r.teacher_id, list);
    }
  }

  // 현재 강사별 예약(가용 그리드 오버레이용) + 진행 중인 수업 목록 — 승인 후 전부(승인/결제대기/결제완료) 조회 후 강사별 파생.
  const bookedByTeacher = new Map<string, BookedSlot[]>();
  const classesByTeacher = new Map<string, TeacherClassItem[]>();
  if (teacherIds.length > 0) {
    const { data: enrollRows } = await admin
      .from("enrollments")
      .select("id, teacher_id, course, course_title, slots, status, start_date, student_name, student_english_name")
      .in("teacher_id", teacherIds)
      .in("status", ["승인", "결제대기", "결제완료"]);
    // 종료된 '결제완료'(남은 예정 수업 없음)는 그리드 오버레이·수업 목록에서 제외.
    const ended = await loadEndedEnrollmentIds(admin, teacherIds);
    const rowsByTeacher = new Map<string, NonNullable<typeof enrollRows>>();
    for (const r of enrollRows ?? []) {
      if (r.status === "결제완료" && ended.has(r.id)) continue;
      const list = rowsByTeacher.get(r.teacher_id) ?? [];
      list.push(r);
      rowsByTeacher.set(r.teacher_id, list);
    }
    rowsByTeacher.forEach((rows, tid) => bookedByTeacher.set(tid, deriveBookedSlots(rows)));

    // 강사별 classes 집계(진행률·다음 수업일). 승인/결제대기 enrollment는 아직 classes 없음.
    const { data: clsRows } = await admin
      .from("classes")
      .select("enrollment_id, session_date, start_min, end_min, status, is_makeup")
      .in("teacher_id", teacherIds);
    const now = Date.now();
    const aggByEnrollment = new Map<string, { total: number; done: number; nextDate: string | null; nextMin: number | null }>();
    for (const c of clsRows ?? []) {
      const a = aggByEnrollment.get(c.enrollment_id) ?? { total: 0, done: 0, nextDate: null, nextMin: null };
      if (c.status !== "취소") {
        if (!c.is_makeup) a.total += 1; // 계획 회차(보강 제외)
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

    rowsByTeacher.forEach((rows, tid) => {
      const items: TeacherClassItem[] = rows.map((r) => {
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
      // 다음 수업일 오름차순(없으면 뒤), 그다음 시작일.
      items.sort((a, b) => {
        const an = a.nextDate ?? "9999-99-99";
        const bn = b.nextDate ?? "9999-99-99";
        if (an !== bn) return an < bn ? -1 : 1;
        return (a.startDate ?? "").localeCompare(b.startDate ?? "");
      });
      classesByTeacher.set(tid, items);
    });
  }

  const currentTeachers: CurrentTeacher[] = (
    (teacherProfiles ?? []) as {
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
    }[]
  ).map((p) => ({
    id: p.id,
    email: emailById.get(p.id) ?? "(이메일 없음)",
    name: [p.first_name, p.last_name].filter(Boolean).join(" "),
    phone: p.phone,
    nationality: p.nationality,
    gender: p.gender,
    centerName: p.center_id ? (centerNameById.get(p.center_id) ?? null) : null,
    bio: p.bio,
    experience: p.experience,
    zoomUrl: p.zoom_url,
    avatarUrl: p.avatar_url,
    slots: slotsByTeacher.get(p.id) ?? [],
    bookedSlots: bookedByTeacher.get(p.id) ?? [],
    classes: classesByTeacher.get(p.id) ?? [],
  }));

  return <TeacherRequestsManager applications={applications} currentTeachers={currentTeachers} />;
}
