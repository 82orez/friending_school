import { createAdminClient } from "@/utils/supabase/admin";
import TeacherRequestsManager, { type TeacherApplication, type CurrentTeacher } from "@/components/admin/TeacherRequestsManager";
import { deriveBookedSlots, type BookedSlot } from "@/lib/availability";

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

  // 현재 강사별 예약(가용 그리드 오버레이용) — 승인 후 전부(승인/결제대기/결제완료) 조회 후 강사별 파생.
  const bookedByTeacher = new Map<string, BookedSlot[]>();
  if (teacherIds.length > 0) {
    const { data: enrollRows } = await admin
      .from("enrollments")
      .select("teacher_id, slots, status, student_name, student_english_name")
      .in("teacher_id", teacherIds)
      .in("status", ["승인", "결제대기", "결제완료"]);
    const rowsByTeacher = new Map<string, NonNullable<typeof enrollRows>>();
    for (const r of enrollRows ?? []) {
      const list = rowsByTeacher.get(r.teacher_id) ?? [];
      list.push(r);
      rowsByTeacher.set(r.teacher_id, list);
    }
    rowsByTeacher.forEach((rows, tid) => bookedByTeacher.set(tid, deriveBookedSlots(rows)));
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
  }));

  return <TeacherRequestsManager applications={applications} currentTeachers={currentTeachers} />;
}
