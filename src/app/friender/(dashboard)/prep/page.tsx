import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
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

  // RLS prep_courses_select_own / prep_sessions_select_own이 본인 것만 통과시킨다.
  const { data } = await supabase
    .from("prep_courses")
    .select("id, title, description, level, capacity, start_min, duration_min, session_count, price_krw, prep_sessions(session_date)")
    .order("created_at", { ascending: false });

  const courses: PrepCourse[] = (
    (data ?? []) as unknown as (Omit<PrepCourse, "sessionDates"> & {
      start_min: number;
      duration_min: number;
      session_count: number;
      price_krw: number;
      prep_sessions: { session_date: string }[] | null;
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
    // 임베드는 정렬이 안 붙어 여기서 오름차순으로 맞춘다(기간 표시가 첫/마지막 회차 기준).
    sessionDates: (c.prep_sessions ?? []).map((s) => s.session_date).sort(),
  }));

  const { data: prof } = await supabase.from("profiles").select("zoom_url").eq("id", user.id).maybeSingle();
  const hasZoomUrl = !!(prof as { zoom_url?: string | null } | null)?.zoom_url?.trim();

  return <PrepManager courses={courses} hasZoomUrl={hasZoomUrl} />;
}
