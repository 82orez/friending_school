import { createAdminClient } from "@/utils/supabase/admin";
import CentersManager, { type AdminCenter } from "@/components/admin/CentersManager";

export default async function AdminCentersPage() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("centers")
    .select("id, name, sort_order, created_at, price_per_session, price_currency")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const { data: rateRow } = await admin.from("settings").select("value").eq("key", "php_to_krw").maybeSingle();
  const phpToKrw = Number((rateRow as { value?: string } | null)?.value) || 0;

  return <CentersManager centers={(data ?? []) as AdminCenter[]} phpToKrw={phpToKrw} />;
}
