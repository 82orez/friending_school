import { createAdminClient } from "@/utils/supabase/admin";
import ApplicationsManager, { type AdminApplication } from "@/components/admin/ApplicationsManager";

export default async function AdminApplicationsPage() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("applications")
    .select("id, course_title, option, name, phone, email, memo, status, admin_note, created_at")
    .order("created_at", { ascending: false });

  return <ApplicationsManager applications={(data ?? []) as AdminApplication[]} />;
}
