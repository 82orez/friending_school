import { createAdminClient } from "@/utils/supabase/admin";
import PrepCoursesManager, { type AdminPrepCourse } from "@/components/admin/PrepCoursesManager";

// 심사 대기부터 훑는다. 작성중(프렌더 초안)은 참고용이라 맨 뒤.
const STATUS_ORDER: Record<string, number> = { 신청: 0, 거절: 1, 승인: 2, 작성중: 3 };

export default async function AdminPrepPage() {
  // service_role로 전량 조회 — RLS(prep_courses_select_own)는 개설자 본인만 통과시킨다.
  const admin = createAdminClient();
  const { data } = await admin
    .from("prep_courses")
    .select(
      "id, friender_id, friender_name, friender_nickname, title, description, level, capacity, start_min, duration_min, session_count, price_krw, status, admin_note, submitted_at, created_at, prep_sessions(session_no, session_date, topic)",
    )
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as (Omit<AdminPrepCourse, "sessions"> & {
    prep_sessions: { session_no: number; session_date: string; topic: string | null }[] | null;
  })[];

  const courses: AdminPrepCourse[] = rows
    .map((c) => ({
      ...c,
      // 임베드는 정렬이 안 붙는다(PostgREST) — 회차 순서는 화면에서 그대로 쓰이므로 여기서 맞춘다.
      sessions: (c.prep_sessions ?? []).slice().sort((a, b) => a.session_date.localeCompare(b.session_date)),
    }))
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));

  return <PrepCoursesManager courses={courses} />;
}
