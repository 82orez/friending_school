import { createAdminClient } from "@/utils/supabase/admin";
import RevenueManager from "@/components/admin/RevenueManager";
import { loadRevenueRows } from "@/lib/revenue";

// 매출 현황 대시보드(읽기 전용). payments를 소스로 순매출(amount − cancelled_amount)을 기간·분류별 집계.
// 데이터 조립은 loadRevenueRows(server-only, 매출이익 대시보드와 공용)에 위임.
// 성능: 결제 전량 로드 후 클라 집계 — 중규모까지 적정. 대규모 시 기간 파라미터로 조회 범위 축소가 scale path.
export default async function AdminRevenuePage() {
  const admin = createAdminClient();
  const { rows, rates } = await loadRevenueRows(admin);
  return <RevenueManager rows={rows} rates={rates} />;
}
