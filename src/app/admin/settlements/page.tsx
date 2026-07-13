import { createAdminClient } from "@/utils/supabase/admin";
import SettlementsManager from "@/components/admin/SettlementsManager";
import { loadSettlementRows } from "@/lib/settlements";

// 강사 정산 리포트(읽기 전용). conducted_at이 찍힌(실제 진행된) 수업만 집계하고,
// 단가는 rate_schedules 적용일 이력을 수업 날짜(session_date) 기준으로 역산한다
// (강사 개별 단가 > 소속 센터 단가, price=null 행=센터 복귀). 조립은 공유 로더(loadSettlementRows).
// 성능: conducted 수업 전량을 로드해 클라에서 기간·분류 집계 — 중규모까지 적정.
export default async function AdminSettlementsPage() {
  const admin = createAdminClient();
  const { rows, rates } = await loadSettlementRows(admin);
  return <SettlementsManager rows={rows} rates={rates} />;
}
