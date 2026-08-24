import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import MyPrepEnrollments, { type MyPrepEnrollment } from "@/components/mypage/MyPrepEnrollments";

// 내 프렙 수강신청 내역 — **신청·입금·취소 기록 전용**(정규 과정의 「수강신청 내역」과 같은 역할).
// ⚠️ 회차 목록·입장은 「내 강의실」(/mypage/classroom)이 담당한다 — 입장 동선은 과정 종류와 무관하게 한 곳이어야 한다.
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

  return <MyPrepEnrollments enrollments={enrollments} />;
}
