import "server-only";

import type { createAdminClient } from "@/utils/supabase/admin";
import type { RevenueRow } from "@/components/admin/RevenueManager";
import { FOREIGN_CURRENCIES, normalizeCurrency, ratesFromSettings, type Rates } from "@/data/currencies";
import { toKrwAt, type FxRow } from "@/lib/fx";
import { vatSupply } from "@/lib/vat";
import { isPgPayment, pgFeeOf, pgFeeRateAt, type PgFeeRow } from "@/lib/pgfee";

// 매출 row 조립 공유 로더 — 매출 현황·매출이익 대시보드 공용(loadSettlementRows 미러).
// payments를 소스로 순매출(amount − cancelled_amount)을 결제일(KST) 기준으로 집계 가능한 row로 변환.
// status='failed'는 제외(실현 매출), 테스트(enrollments.is_test)는 플래그로 남겨 클라 토글로 포함/제외.
// payments RLS는 본인 select만 허용 → admin 전량 조회는 service_role(createAdminClient) 필수.
export async function loadRevenueRows(admin: ReturnType<typeof createAdminClient>): Promise<{ rows: RevenueRow[]; rates: Rates }> {
  const { data: payData } = await admin
    .from("payments")
    .select("payment_id, enrollment_id, student_id, amount, cancelled_amount, status, method, currency, receipt_url, note, created_at")
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
    note: string | null;
    created_at: string;
  }[];

  // enrollment 스냅샷 병합(과정·강사·학생명·테스트 여부).
  const enrollmentIds = Array.from(new Set(payments.map((p) => p.enrollment_id).filter(Boolean) as string[]));
  const enrById = new Map<
    string,
    {
      course: string | null;
      course_title: string | null;
      teacher_id: string | null;
      teacher_name: string | null;
      student_name: string | null;
      student_english_name: string | null;
      is_test: boolean;
    }
  >();
  if (enrollmentIds.length > 0) {
    const { data: enrData } = await admin
      .from("enrollments")
      .select("id, course, course_title, teacher_id, teacher_name, student_name, student_english_name, is_test")
      .in("id", enrollmentIds);
    for (const e of (enrData ?? []) as {
      id: string;
      course: string | null;
      course_title: string | null;
      teacher_id: string | null;
      teacher_name: string | null;
      student_name: string | null;
      student_english_name: string | null;
      is_test: boolean | null;
    }[]) {
      enrById.set(e.id, {
        course: e.course,
        course_title: e.course_title,
        teacher_id: e.teacher_id,
        teacher_name: e.teacher_name,
        student_name: e.student_name,
        student_english_name: e.student_english_name,
        is_test: !!e.is_test,
      });
    }
  }

  // 강사 현재 소속 센터 역산(teacher_id → profiles.center_id → centers.name) — 정산 리포트와 동일 원칙.
  const teacherIds = Array.from(
    new Set(
      Array.from(enrById.values())
        .map((e) => e.teacher_id)
        .filter(Boolean) as string[],
    ),
  );
  const centerIdByTeacher = new Map<string, string | null>();
  if (teacherIds.length > 0) {
    const { data: profData } = await admin.from("profiles").select("id, center_id").in("id", teacherIds);
    for (const p of (profData ?? []) as { id: string; center_id: string | null }[]) {
      centerIdByTeacher.set(p.id, p.center_id);
    }
  }
  const { data: centerData } = await admin.from("centers").select("id, name");
  const centerNameById = new Map(((centerData ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));

  const { data: rateRows } = await admin
    .from("settings")
    .select("key, value")
    .in(
      "key",
      FOREIGN_CURRENCIES.map((f) => f.settingKey),
    );
  const rates = ratesFromSettings(rateRows as { key: string; value: string | null }[] | null);

  // 환율 적용일 이력 전량(결제일 기준 원화 환산 소스).
  const { data: fxData } = await admin.from("exchange_rate_schedules").select("id, currency, rate_to_krw, effective_from, note");
  const fxRows: FxRow[] = (
    (fxData ?? []) as { id: string; currency: string; rate_to_krw: number | string; effective_from: string; note: string | null }[]
  ).map((r) => ({ id: r.id, currency: r.currency, rate: Number(r.rate_to_krw), effectiveFrom: r.effective_from, note: r.note }));

  // PG 수수료율 적용일 이력 전량(결제일 기준 유효 율 소스). 비면 율 0 = 수수료 미반영.
  const { data: feeData } = await admin.from("pg_fee_schedules").select("id, rate_percent, effective_from, note");
  const feeRows: PgFeeRow[] = ((feeData ?? []) as { id: string; rate_percent: number | string; effective_from: string; note: string | null }[]).map(
    (r) => ({
      id: r.id,
      ratePercent: Number(r.rate_percent),
      effectiveFrom: r.effective_from,
      note: r.note,
    }),
  );

  const rows: RevenueRow[] = payments
    .map((p) => {
      const enr = p.enrollment_id ? enrById.get(p.enrollment_id) : undefined;
      const centerId = enr?.teacher_id ? (centerIdByTeacher.get(enr.teacher_id) ?? null) : null;
      // created_at(timestamptz) → KST 날짜 문자열(기간 필터·집계·환율 환산 기준).
      const kstDate = new Date(p.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
      const amount = Number(p.amount) || 0;
      const cancelledAmount = Number(p.cancelled_amount) || 0;
      const currency = normalizeCurrency(p.currency);
      // 결제일 기준 환율로 원화 환산(집계는 이 값 합산). KRW 결제는 passthrough.
      const krwAmount = toKrwAt(amount, currency, fxRows, kstDate);
      const krwCancelledAmount = toKrwAt(cancelledAmount, currency, fxRows, kstDate);
      // 부가세 포함 합계 → 공급가액/부가세 역산(행별 반올림 후 합산해 감사 정합).
      const krwSupply = vatSupply(krwAmount);
      const krwCancelledSupply = vatSupply(krwCancelledAmount);
      // PG 수수료: 결제일 유효 율 × 순결제액(결제액 − 환불액). 무통장 입금은 0.
      const pgFeeRate = isPgPayment(p.method) ? pgFeeRateAt(feeRows, kstDate) : 0;
      return {
        paymentId: p.payment_id,
        createdAt: p.created_at,
        kstDate,
        amount,
        cancelledAmount,
        krwAmount,
        krwCancelledAmount,
        krwSupply,
        krwVat: krwAmount - krwSupply,
        krwCancelledSupply,
        krwCancelledVat: krwCancelledAmount - krwCancelledSupply,
        pgFeeRate,
        krwPgFee: pgFeeOf(krwAmount - krwCancelledAmount, pgFeeRate),
        status: p.status,
        method: p.method,
        currency,
        course: enr?.course ?? null,
        courseTitle: enr?.course_title ?? null,
        studentName: enr?.student_name ?? null,
        studentEnglishName: enr?.student_english_name ?? null,
        teacherId: enr?.teacher_id ?? null,
        teacherName: enr?.teacher_name ?? null,
        centerId,
        centerName: centerId ? (centerNameById.get(centerId) ?? null) : null,
        receiptUrl: p.receipt_url,
        note: p.note,
        enrollmentId: p.enrollment_id,
        isTest: enr?.is_test ?? false,
      };
    })
    // 실현 매출만: failed 제외. 테스트(is_test) 건은 행에 플래그로 남기고 클라 토글로 포함/제외.
    .filter((r) => r.status !== "failed");

  return { rows, rates };
}
