import { createAdminClient } from "@/utils/supabase/admin";
import SettlementsManager from "@/components/admin/SettlementsManager";
import MonthlySettlementSection, { type CenterSettlementRecord } from "@/components/admin/MonthlySettlementSection";
import { loadSettlementRows } from "@/lib/settlements";

// 강사 정산 리포트. conducted_at이 찍힌(실제 진행된) 수업만 집계, 단가는 rate_schedules 적용일 이력을 역산.
// 하단에 센터별 월간 정산 확정 원장(center_settlements) 섹션 추가(admin 전용) — 선 정산·소속 강사 지급 기록.
export default async function AdminSettlementsPage() {
  const admin = createAdminClient();
  const { rows, rates } = await loadSettlementRows(admin);

  const { data: centerData } = await admin.from("centers").select("id, name, price_currency").order("sort_order", { ascending: true });
  const centers = ((centerData ?? []) as { id: string; name: string; price_currency: string | null }[]).map((c) => ({
    id: c.id,
    name: c.name,
    currency: c.price_currency ?? "KRW",
  }));

  const { data: recData } = await admin
    .from("center_settlements")
    .select("id, center_id, period_month, sessions_count, currency, base_amount, base_krw, base_native, adjustments, total_krw, status, note, paid_at, confirmed_at");
  const records: Record<string, CenterSettlementRecord> = {};
  for (const r of (recData ?? []) as {
    id: string;
    center_id: string | null;
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
    if (!r.center_id) continue;
    records[`${r.center_id}|${r.period_month}`] = {
      id: r.id,
      centerId: r.center_id,
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

  // 테스트용: 마감 전(당월) 확정 허용 플래그(서버 전용 env). 서버 액션도 동일 변수로 가드.
  const allowEarly = process.env.ALLOW_EARLY_SETTLEMENT_CONFIRM === "true";

  return (
    <>
      <SettlementsManager rows={rows} rates={rates} />
      <MonthlySettlementSection centers={centers} rows={rows} rates={rates} records={records} allowEarly={allowEarly} />
    </>
  );
}
