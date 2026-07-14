import { createAdminClient } from "@/utils/supabase/admin";
import SettlementsManager, { type SettlementRecord } from "@/components/admin/SettlementsManager";
import { loadSettlementRows } from "@/lib/settlements";

// 강사 정산 리포트. conducted_at이 찍힌(실제 진행된) 수업만 집계, 단가는 rate_schedules 적용일 이력을 역산.
// 월간 정산 확정 원장(teacher_settlements)을 함께 로드해 강사별+월간 뷰에서 확정/지급완료 관리.
export default async function AdminSettlementsPage() {
  const admin = createAdminClient();
  const { rows, rates } = await loadSettlementRows(admin);

  const { data: recData } = await admin
    .from("teacher_settlements")
    .select("id, teacher_id, period_month, sessions_count, currency, base_amount, base_krw, base_native, adjustments, total_krw, status, note, paid_at, confirmed_at");
  const settlementRecords: Record<string, SettlementRecord> = {};
  for (const r of (recData ?? []) as {
    id: string;
    teacher_id: string;
    period_month: string;
    sessions_count: number;
    currency: string | null;
    base_amount: number | string | null;
    base_krw: number | string;
    base_native: Record<string, number> | null;
    adjustments: { label: string; amount: number; currency: string; krw: number }[] | null;
    total_krw: number | string;
    status: "확정" | "지급완료";
    note: string | null;
    paid_at: string | null;
    confirmed_at: string;
  }[]) {
    settlementRecords[`${r.teacher_id}|${r.period_month}`] = {
      id: r.id,
      teacherId: r.teacher_id,
      periodMonth: r.period_month,
      sessionsCount: r.sessions_count,
      currency: r.currency,
      baseAmount: r.base_amount == null ? null : Number(r.base_amount),
      baseKrw: Number(r.base_krw),
      baseNative: r.base_native ?? {},
      adjustments: r.adjustments ?? [],
      totalKrw: Number(r.total_krw),
      status: r.status,
      note: r.note,
      paidAt: r.paid_at,
      confirmedAt: r.confirmed_at,
    };
  }

  return <SettlementsManager rows={rows} rates={rates} enableFinalize settlementRecords={settlementRecords} />;
}
