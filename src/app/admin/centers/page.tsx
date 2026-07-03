import { createAdminClient } from "@/utils/supabase/admin";
import CentersManager, { type AdminCenter } from "@/components/admin/CentersManager";
import { FOREIGN_CURRENCIES, ratesFromSettings } from "@/data/currencies";

export default async function AdminCentersPage() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("centers")
    .select("id, name, sort_order, created_at, price_per_session, price_currency, manager_name")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const { data: rateRows } = await admin
    .from("settings")
    .select("key, value")
    .in(
      "key",
      FOREIGN_CURRENCIES.map((f) => f.settingKey),
    );
  const rates = ratesFromSettings(rateRows as { key: string; value: string | null }[] | null);

  // numeric 컬럼은 문자열로 올 수 있어 price를 숫자로 강제(null 보존).
  const centers = ((data ?? []) as AdminCenter[]).map((c) => ({
    ...c,
    price_per_session: c.price_per_session == null ? null : Number(c.price_per_session),
  }));

  return <CentersManager centers={centers} rates={rates} />;
}
