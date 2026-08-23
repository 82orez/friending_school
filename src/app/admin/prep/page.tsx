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
      "id, friender_id, friender_name, friender_nickname, title, description, level, capacity, start_min, duration_min, session_count, price_krw, status, admin_note, submitted_at, reviewed_at, created_at, prep_sessions(session_no, session_date, topic)",
    )
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as (Omit<AdminPrepCourse, "sessions" | "friender_phone" | "friender_email"> & {
    prep_sessions: { session_no: number; session_date: string; topic: string | null }[] | null;
  })[];

  // 개설된 강좌 상세에서 프렌더에게 연락할 수 있어야 한다(폐강·일정 문의). 이름 스냅샷과 달리 연락처는 매번 최신값을 읽는다.
  // ⚠️ 이메일은 profiles에 없어 auth 쪽에서 가져온다(friender-requests 페이지와 같은 방식).
  const frienderIds = Array.from(new Set(rows.map((r) => r.friender_id)));
  const phoneById = new Map<string, string | null>();
  const emailById = new Map<string, string>();
  if (frienderIds.length > 0) {
    const { data: profs } = await admin.from("profiles").select("id, phone").in("id", frienderIds);
    for (const p of (profs ?? []) as { id: string; phone: string | null }[]) phoneById.set(p.id, p.phone);
    const { data: usersData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of usersData?.users ?? []) if (u.email) emailById.set(u.id, u.email);
  }

  const courses: AdminPrepCourse[] = rows
    .map((c) => ({
      ...c,
      friender_phone: phoneById.get(c.friender_id) ?? null,
      friender_email: emailById.get(c.friender_id) ?? "",
      // 임베드는 정렬이 안 붙는다(PostgREST) — 회차 순서는 화면에서 그대로 쓰이므로 여기서 맞춘다.
      sessions: (c.prep_sessions ?? []).slice().sort((a, b) => a.session_date.localeCompare(b.session_date)),
    }))
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));

  return <PrepCoursesManager courses={courses} />;
}
