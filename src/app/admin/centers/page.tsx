import { createAdminClient } from "@/utils/supabase/admin";
import CentersManager, { type AdminCenter } from "@/components/admin/CentersManager";

export default async function AdminCentersPage() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("centers")
    .select("id, name, sort_order, created_at, price_per_session")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  return <CentersManager centers={(data ?? []) as AdminCenter[]} />;
}
