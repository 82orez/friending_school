import { createAdminClient } from "@/utils/supabase/admin";
import RevenueManager, { type RevenueRow } from "@/components/admin/RevenueManager";
import { FOREIGN_CURRENCIES, normalizeCurrency, ratesFromSettings } from "@/data/currencies";

// 매출 현황 대시보드(읽기 전용). payments를 소스로 순매출(amount − cancelled_amount)을 기간·분류별 집계.
// status='failed' 및 admin 테스트 수강신청(enrollments.is_test) 결제는 제외(실현 매출/개발 아티팩트).
// payments RLS는 본인 select만 허용 → admin 전량 조회는 service_role(createAdminClient) 필수.
// 성능: 결제 전량 로드 후 클라 집계 — 중규모까지 적정. 대규모 시 기간 파라미터로 조회 범위 축소가 scale path.
export default async function AdminRevenuePage() {
  const admin = createAdminClient();

  const { data: payData } = await admin
    .from("payments")
    .select("payment_id, enrollment_id, student_id, amount, cancelled_amount, status, method, currency, receipt_url, created_at")
    .order("created_at", { ascending: false });
  const payments = (payData ?? []) as {
    payment_id: string;
    enrollment_id: string | null;
    student_id: string | null;
    amount: number;
    cancelled_amount: number;
    status: string;
    method: string | null;
    currency: string | null;
    receipt_url: string | null;
    created_at: string;
  }[];

  // enrollment 스냅샷 병합(과정·강사·학생명·테스트 여부).
  const enrollmentIds = Array.from(new Set(payments.map((p) => p.enrollment_id).filter(Boolean) as string[]));
  const enrById = new Map<
    string,
    { course: string | null; course_title: string | null; teacher_name: string | null; student_name: string | null; student_english_name: string | null; is_test: boolean }
  >();
  if (enrollmentIds.length > 0) {
    const { data: enrData } = await admin
      .from("enrollments")
      .select("id, course, course_title, teacher_name, student_name, student_english_name, is_test")
      .in("id", enrollmentIds);
    for (const e of (enrData ?? []) as {
      id: string;
      course: string | null;
      course_title: string | null;
      teacher_name: string | null;
      student_name: string | null;
      student_english_name: string | null;
      is_test: boolean | null;
    }[]) {
      enrById.set(e.id, {
        course: e.course,
        course_title: e.course_title,
        teacher_name: e.teacher_name,
        student_name: e.student_name,
        student_english_name: e.student_english_name,
        is_test: !!e.is_test,
      });
    }
  }

  const { data: rateRows } = await admin
    .from("settings")
    .select("key, value")
    .in(
      "key",
      FOREIGN_CURRENCIES.map((f) => f.settingKey),
    );
  const rates = ratesFromSettings(rateRows as { key: string; value: string | null }[] | null);

  const rows: RevenueRow[] = payments
    .map((p) => {
      const enr = p.enrollment_id ? enrById.get(p.enrollment_id) : undefined;
      return {
        paymentId: p.payment_id,
        createdAt: p.created_at,
        // created_at(timestamptz) → KST 날짜 문자열(기간 필터·집계 기준, 문자열 비교).
        kstDate: new Date(p.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }),
        amount: Number(p.amount) || 0,
        cancelledAmount: Number(p.cancelled_amount) || 0,
        status: p.status,
        method: p.method,
        currency: normalizeCurrency(p.currency),
        course: enr?.course ?? null,
        courseTitle: enr?.course_title ?? null,
        studentName: enr?.student_name ?? null,
        studentEnglishName: enr?.student_english_name ?? null,
        teacherName: enr?.teacher_name ?? null,
        receiptUrl: p.receipt_url,
        enrollmentId: p.enrollment_id,
        isTest: enr?.is_test ?? false,
      };
    })
    // 실현 매출만: failed 제외 + admin 테스트 수강신청 결제 제외.
    .filter((r) => r.status !== "failed" && !r.isTest);

  return <RevenueManager rows={rows} rates={rates} />;
}
