import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { TOTAL_SESSIONS, type Slot } from "@/lib/availability";
import { getCourse } from "@/data/courses";
import { COURSE_PRICE_KRW } from "@/data/pricing";
import { formatPrice } from "@/data/currencies";
import StudentEnrollments, { type StudentEnrollment } from "@/components/mypage/StudentEnrollments";
import MyPrepEnrollments, { type MyPrepEnrollment } from "@/components/mypage/MyPrepEnrollments";

type EnrollmentRow = {
  id: string;
  course: string;
  course_title: string;
  price_krw: number | null;
  teacher_name: string | null;
  start_date: string;
  total_sessions: number | null;
  slots: Slot[];
  status: "신청" | "승인" | "결제대기" | "결제완료" | "거절" | "취소";
  teacher_note: string | null;
  created_at: string;
};

export default async function MyPageEnrollments() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/mypage/enrollments");

  const { data } = await supabase
    .from("enrollments")
    .select("id, course, course_title, price_krw, teacher_name, start_date, total_sessions, slots, status, teacher_note, created_at")
    .eq("student_id", user.id)
    .order("created_at", { ascending: false });

  // 본인 결제 기록(payments) 조회 — enrollment_id별 최신 1건(결제 상세·영수증·환불 판별 공용, RLS payments_select_own).
  const { data: payRows } = await supabase
    .from("payments")
    .select("enrollment_id, prep_enrollment_id, status, amount, currency, method, receipt_url, cancelled_amount, created_at")
    .eq("student_id", user.id)
    .order("created_at", { ascending: false });
  type PayRow = {
    enrollment_id: string | null;
    prep_enrollment_id: string | null;
    status: string;
    amount: number;
    currency: string;
    method: string | null;
    receipt_url: string | null;
    cancelled_amount: number;
    created_at: string;
  };
  const paymentByEnrollment = new Map<string, StudentEnrollment["payment"]>();
  for (const p of (payRows ?? []) as PayRow[]) {
    if (p.enrollment_id && !paymentByEnrollment.has(p.enrollment_id)) {
      paymentByEnrollment.set(p.enrollment_id, {
        status: p.status,
        amount: p.amount,
        currency: p.currency,
        method: p.method,
        receiptUrl: p.receipt_url,
        cancelledAmount: p.cancelled_amount,
        createdAt: p.created_at,
      });
    }
  }

  const enrollments: StudentEnrollment[] = ((data ?? []) as EnrollmentRow[]).map((e) => ({
    id: e.id,
    courseTitle: e.course_title,
    // 결제 금액 = per-건 가격(price_krw) 우선, 없으면 과정 고정가. priceKrw는 카드 결제창 금액용 숫자.
    priceLabel: e.price_krw != null ? formatPrice(e.price_krw, "KRW") : (getCourse(e.course)?.price ?? ""),
    priceKrw: e.price_krw ?? COURSE_PRICE_KRW,
    teacherName: e.teacher_name,
    startDate: e.start_date,
    totalSessions: e.total_sessions ?? TOTAL_SESSIONS,
    slots: Array.isArray(e.slots) ? e.slots : [],
    status: e.status,
    teacherNote: e.teacher_note,
    createdAt: e.created_at,
    payment: paymentByEnrollment.get(e.id) ?? null,
    refunded: (() => {
      const s = paymentByEnrollment.get(e.id)?.status;
      return s === "cancelled" || s === "partial_cancelled";
    })(),
  }));

  // 프렙 신청 내역 — 「프렙 수강」 탭을 여기로 통합했다(입장=내 강의실 / 신청·결제 기록=이 탭 두 축).
  // ⚠️ 강좌 정보는 임베드가 아니라 **신청 시점 스냅샷 컬럼**을 쓴다 — 프렌더가 강좌를 고쳐 승인이 풀리면
  //    prep_courses 공개 정책(status='승인')에서 빠져 임베드가 비어 버린다. RLS prep_enrollments_select_own.
  const { data: prepData } = await supabase
    .from("prep_enrollments")
    .select(
      "id, course_id, course_title, start_min, duration_min, session_count, first_session_date, last_session_date, price_krw, status, paid_at, created_at",
    )
    .order("created_at", { ascending: false });
  // 프렙 환불액 — 정규 과정의 '환불됨' 배지와 같은 판정을 스냅샷 행에도 붙인다(취소 + 환불 기록).
  const prepRefundByEnrollment = new Map<string, number>();
  for (const p of (payRows ?? []) as PayRow[]) {
    if (p.prep_enrollment_id && (p.cancelled_amount ?? 0) > 0) prepRefundByEnrollment.set(p.prep_enrollment_id, p.cancelled_amount);
  }
  const prepEnrollments = ((prepData ?? []) as unknown as MyPrepEnrollment[]).map((e) => ({
    ...e,
    refundedKrw: prepRefundByEnrollment.get(e.id) ?? 0,
  }));

  return (
    <div className="space-y-5">
      <StudentEnrollments enrollments={enrollments} />
      <MyPrepEnrollments enrollments={prepEnrollments} />
    </div>
  );
}
