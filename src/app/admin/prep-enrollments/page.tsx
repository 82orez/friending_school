import { createAdminClient } from "@/utils/supabase/admin";
import PrepEnrollmentsManager, { type AdminPrepEnrollmentRow, type PrepCourseOption } from "@/components/admin/PrepEnrollmentsManager";
import { frienderLabel } from "@/lib/prep";

// 프렙 수강신청 관리 — 전 강좌의 신청을 한 목록에서 처리한다.
// ⚠️ 강좌 상세 모달(/admin/prep)은 요약 + 이 화면 딥링크만 갖는다(액션 소유자는 여기 하나).
export default async function AdminPrepEnrollmentsPage({ searchParams }: { searchParams: Promise<{ course?: string }> }) {
  const { course: courseParam } = await searchParams;

  // service_role로 전량 조회 — RLS(prep_enrollments_select_own)는 본인 행만 통과시킨다.
  const admin = createAdminClient();
  const { data } = await admin
    .from("prep_enrollments")
    .select(
      "id, course_id, course_title, student_name, student_phone, price_krw, session_count, first_session_date, last_session_date, status, paid_at, cancelled_at, admin_note, created_at, prep_courses(title, friender_name, friender_nickname, session_count)",
    )
    .order("created_at", { ascending: false })
    .limit(2000); // ⏳ 근접하면 cap을 올리지 말고 기간 필터를 붙일 것(rooms/page.tsx와 같은 정책)

  type Raw = Omit<AdminPrepEnrollmentRow, "friender" | "courseLabel" | "isMidjoin" | "paidKrw" | "refundedKrw"> & {
    prep_courses: { title: string; friender_name: string | null; friender_nickname: string | null; session_count: number } | null;
  };
  const raws = (data ?? []) as unknown as Raw[];

  // 결제·환불 기록(payments) 병합 — 환불 가능액과 「환불」 배지의 근거다.
  // ⚠️ 신청 스냅샷 price_krw가 아니라 **결제 원본**을 봐야 한다(부분 환불이면 남은 금액이 다르다).
  const { data: payData } = await admin
    .from("payments")
    .select("prep_enrollment_id, amount, cancelled_amount")
    .in("prep_enrollment_id", raws.map((r) => r.id).slice(0, 2000));
  const payByEnrollment = new Map<string, { amount: number; cancelled: number }>();
  for (const p of (payData ?? []) as { prep_enrollment_id: string | null; amount: number | null; cancelled_amount: number | null }[]) {
    if (p.prep_enrollment_id) payByEnrollment.set(p.prep_enrollment_id, { amount: p.amount ?? 0, cancelled: p.cancelled_amount ?? 0 });
  }

  const rows: AdminPrepEnrollmentRow[] = raws.map(({ prep_courses: c, ...e }) => ({
    ...e,
    // 결제 기록이 없는 건(미입금·백필 이전)은 스냅샷 금액을 결제액으로 본다 — 환불 액션도 같은 폴백을 쓴다.
    paidKrw: payByEnrollment.get(e.id)?.amount ?? e.price_krw,
    refundedKrw: payByEnrollment.get(e.id)?.cancelled ?? 0,
    // 강좌명은 신청 시점 스냅샷이 기본이지만, 강좌가 개명됐으면 현재 이름으로 고르는 편이 관리자에게 자연스럽다.
    courseLabel: c?.title ?? e.course_title,
    friender: c ? frienderLabel(c.friender_name, c.friender_nickname) : "-",
    // 결제한 회차가 강좌 전체보다 적으면 중도 신청(잔여 비례 청구) — 입금 대조에 필요한 표시다.
    isMidjoin: c ? e.session_count < c.session_count : false,
  }));

  // 강좌 필터 옵션 — 신청이 하나라도 있는 강좌만(선택지가 곧 목록의 축이다).
  const seen = new Map<string, PrepCourseOption>();
  for (const r of rows) if (!seen.has(r.course_id)) seen.set(r.course_id, { id: r.course_id, label: r.courseLabel, friender: r.friender });
  const courses = Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label, "ko"));

  const initialCourseId = courseParam && seen.has(courseParam) ? courseParam : "all";

  return <PrepEnrollmentsManager rows={rows} courses={courses} initialCourseId={initialCourseId} />;
}
