import { createAdminClient } from "@/utils/supabase/admin";
import ProfitManager from "@/components/admin/ProfitManager";
import { loadRevenueRows } from "@/lib/revenue";
import { loadSettlementRows } from "@/lib/settlements";

// 매출이익 대시보드(읽기 전용). 매출(결제일 기준 순매출) − 정산(수업 진행일 기준 강사 지급 예정액) = 매출이익.
// 매출·정산 두 파이프라인의 공유 로더를 재사용해 조립만 하고, 집계/이익 계산은 클라(ProfitManager)에서.
// ⚠️ 매출은 결제일(현금주의)·정산은 수업 진행일(발생주의) 기준이라 기간 이익은 운영 캐시뷰(건별 1:1 매칭 아님).
export default async function AdminProfitPage() {
  const admin = createAdminClient();
  const [{ rows: revenueRows, rates }, { rows: settlementRows }] = await Promise.all([loadRevenueRows(admin), loadSettlementRows(admin)]);

  // 센터별 월간 정산 확정 원장 — 확정된 (센터,월)은 KPI 정산을 실지급액으로 교체·'확정' 표시.
  const { data: recData } = await admin.from("center_settlements").select("center_id, period_month, total_krw");
  const settlementRecords: Record<string, { totalKrw: number }> = {};
  for (const r of (recData ?? []) as { center_id: string | null; period_month: string; total_krw: number | string }[]) {
    if (!r.center_id) continue;
    settlementRecords[`${r.center_id}|${r.period_month}`] = { totalKrw: Number(r.total_krw) };
  }

  return <ProfitManager revenueRows={revenueRows} settlementRows={settlementRows} rates={rates} settlementRecords={settlementRecords} />;
}
