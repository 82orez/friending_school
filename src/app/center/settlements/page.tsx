import { redirect } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireCenterManager } from "@/lib/center-manager";
import { loadSettlementRows } from "@/lib/settlements";
import SettlementsManager from "@/components/admin/SettlementsManager";

// 센터 매니저 정산 — 담당 센터 소속 강사가 진행한 수업·회당 단가·정산 예정액(읽기 전용).
// admin 정산 UI(SettlementsManager)를 담당 센터 강사로 스코프해 재사용. 기본 분류=강사별.
export default async function CenterSettlementsPage() {
  const mgr = await requireCenterManager();
  if (!mgr) redirect("/");

  const admin = createAdminClient();
  // 담당 센터 소속 강사 id(현재 소속 기준) — teacher-directory 스코프 패턴과 동일.
  const { data: profs } = await admin.from("profiles").select("id").eq("role", "teacher").in("center_id", mgr.centerIds);
  const teacherIds = ((profs ?? []) as { id: string }[]).map((p) => p.id);

  const { rows, rates } = await loadSettlementRows(admin, teacherIds);

  return <SettlementsManager rows={rows} rates={rates} initialGrouping="강사별" />;
}
