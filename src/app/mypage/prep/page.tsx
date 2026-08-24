import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { loadPrepSessionsForStudent } from "@/lib/prep-session";
import MyPrepEnrollments, { type MyPrepEnrollment } from "@/components/mypage/MyPrepEnrollments";

// 내 프렙 수강신청 내역. ⚠️ 강좌 정보는 임베드가 아니라 **신청 시점 스냅샷 컬럼**을 쓴다 —
// 프렌더가 강좌를 고쳐 승인이 풀리면 prep_courses 공개 정책(status='승인')에서 빠져 임베드가 비어 버린다.
export default async function MyPagePrep() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/mypage/prep");

  // RLS prep_enrollments_select_own이 본인 것만 통과시킨다.
  const { data } = await supabase
    .from("prep_enrollments")
    .select(
      "id, course_id, course_title, start_min, duration_min, session_count, first_session_date, last_session_date, price_krw, status, paid_at, created_at",
    )
    .order("created_at", { ascending: false });

  const enrollments = (data ?? []) as unknown as MyPrepEnrollment[];

  // 회차(입장·출결)는 스냅샷이 아니라 실제 일정이라 별도로 읽는다.
  // ⚠️ service_role — prep_sessions RLS는 _select_own(개설자)/_select_public(승인 강좌)뿐이라
  //    프렌더 수정으로 승인이 풀리는 순간 수강생 세션 client에서 회차가 사라진다(위 스냅샷과 같은 방어).
  //    자격('수강확정')은 loadPrepSessionsForStudent가 직접 확인한다.
  const sessionsByCourse = enrollments.some((e) => e.status === "수강확정") ? await loadPrepSessionsForStudent(user.id) : {};

  return <MyPrepEnrollments enrollments={enrollments} sessionsByCourse={sessionsByCourse} />;
}
