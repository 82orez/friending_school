import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { type Slot } from "@/lib/availability";
import { getCourse } from "@/data/courses";
import StudentEnrollments, { type StudentEnrollment } from "@/components/mypage/StudentEnrollments";

type EnrollmentRow = {
  id: string;
  course: string;
  course_title: string;
  teacher_name: string | null;
  start_date: string;
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
    .select("id, course, course_title, teacher_name, start_date, slots, status, teacher_note, created_at")
    .eq("student_id", user.id)
    .order("created_at", { ascending: false });

  // 본인 결제 기록(payments) 조회 — enrollment_id별 최신 1건(결제 상세·영수증·환불 판별 공용, RLS payments_select_own).
  const { data: payRows } = await supabase
    .from("payments")
    .select("enrollment_id, status, amount, currency, method, receipt_url, cancelled_amount, created_at")
    .eq("student_id", user.id)
    .order("created_at", { ascending: false });
  type PayRow = {
    enrollment_id: string | null;
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
    // 결제 금액 = 과정 고정가(슬러그로 live 해석, 미해석 레거시는 빈 값).
    priceLabel: getCourse(e.course)?.price ?? "",
    teacherName: e.teacher_name,
    startDate: e.start_date,
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

  return <StudentEnrollments enrollments={enrollments} />;
}
