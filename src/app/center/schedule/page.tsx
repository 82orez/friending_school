import { redirect } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireCenterManager } from "@/lib/center-manager";
import { loadCenterSessions, loadCenterTeacherCards } from "@/lib/teacher-directory";
import CenterWeekSchedule from "@/components/center/CenterWeekSchedule";

export default async function CenterSchedulePage() {
  const mgr = await requireCenterManager();
  if (!mgr) redirect("/");

  const admin = createAdminClient();
  const [sessions, teachers] = await Promise.all([loadCenterSessions(admin, mgr.centerIds), loadCenterTeacherCards(admin, mgr.centerIds)]);

  return <CenterWeekSchedule sessions={sessions} teachers={teachers} />;
}
