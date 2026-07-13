import { redirect } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireCenterManager } from "@/lib/center-manager";
import { loadCenterTeachers } from "@/lib/teacher-directory";
import CenterTeachers from "@/components/center/CenterTeachers";

export default async function CenterPage() {
  const mgr = await requireCenterManager();
  if (!mgr) redirect("/");

  const admin = createAdminClient();
  const teachers = await loadCenterTeachers(admin, mgr.centerIds);

  return <CenterTeachers teachers={teachers} centers={mgr.centers} />;
}
