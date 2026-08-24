import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getUserRole, isFrienderPlusRole } from "@/lib/auth";
import PrepManager, { type PrepCourse } from "@/components/friender/PrepManager";

export default async function FrienderPrepPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/friender/prep");

  // ⚠️ 탭을 숨기는 것만으로는 부족 — URL 직접 접근을 여기서 막는다(프렙은 Plus 전용).
  if (!isFrienderPlusRole(await getUserRole(supabase, user.id))) redirect("/friender");

  // RLS prep_courses_select_own / prep_sessions_select_own도 본인 것만 통과시키지만,
  // ⚠️ 소유권은 쿼리에서도 강제한다 — 공개 목록용 `_select_public` 정책이 붙는 순간 permissive 정책이 OR로 합쳐져
  //    RLS만 믿은 화면에 남의 강좌가 섞인다(연습방·받은 후기에서 실제로 겪은 회귀).
  const { data } = await supabase
    .from("prep_courses")
    .select(
      "id, title, description, level, capacity, start_min, duration_min, session_count, price_krw, status, admin_note, prep_sessions(session_date, topic)",
    )
    .eq("friender_id", user.id)
    .order("created_at", { ascending: false });

  const courses: PrepCourse[] = (
    (data ?? []) as unknown as (Omit<PrepCourse, "sessions" | "adminNote"> & {
      admin_note: string | null;
      start_min: number;
      duration_min: number;
      session_count: number;
      price_krw: number;
      prep_sessions: { session_date: string; topic: string | null }[] | null;
    })[]
  ).map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description,
    level: c.level,
    capacity: c.capacity,
    startMin: c.start_min,
    durationMin: c.duration_min,
    sessionCount: c.session_count,
    priceKrw: c.price_krw,
    status: c.status,
    adminNote: c.admin_note,
    enrolled: 0, // 아래에서 채운다
    // 임베드는 정렬이 안 붙어 여기서 오름차순으로 맞춘다(기간·커리큘럼 표시가 회차 순서를 따른다).
    sessions: (c.prep_sessions ?? []).map((s) => ({ date: s.session_date, topic: s.topic })).sort((a, b) => a.date.localeCompare(b.date)),
  }));

  // 신청자 수 — 신청자 RLS는 select_own뿐이라 개설자도 세션 client로 못 읽는다 → service_role로 카운트만
  // (연습방 참여 인원과 같은 방식. 신원은 노출하지 않는다).
  if (courses.length > 0) {
    const { data: counts } = await createAdminClient()
      .from("prep_enrollments")
      .select("course_id")
      .in(
        "course_id",
        courses.map((c) => c.id),
      )
      .neq("status", "취소");
    const byCourse = new Map<string, number>();
    for (const row of (counts ?? []) as { course_id: string }[]) byCourse.set(row.course_id, (byCourse.get(row.course_id) ?? 0) + 1);
    for (const c of courses) c.enrolled = byCourse.get(c.id) ?? 0;
  }

  const { data: prof } = await supabase.from("profiles").select("zoom_url").eq("id", user.id).maybeSingle();
  const hasZoomUrl = !!(prof as { zoom_url?: string | null } | null)?.zoom_url?.trim();

  return <PrepManager courses={courses} hasZoomUrl={hasZoomUrl} />;
}
