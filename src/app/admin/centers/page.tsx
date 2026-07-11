import { createAdminClient } from "@/utils/supabase/admin";
import CentersManager, { type AdminCenter } from "@/components/admin/CentersManager";
import { FOREIGN_CURRENCIES, ratesFromSettings } from "@/data/currencies";
import type { RateRow } from "@/lib/rates";

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

  // 센터별 단가 적용일 이력(상세 모달 편집기용).
  const { data: rsData } = await admin
    .from("rate_schedules")
    .select("id, scope, scope_id, price_per_session, currency, effective_from, note")
    .eq("scope", "center");
  const schedulesByCenter: Record<string, RateRow[]> = {};
  for (const r of (rsData ?? []) as {
    id: string;
    scope: "center" | "teacher";
    scope_id: string;
    price_per_session: number | string | null;
    currency: string | null;
    effective_from: string;
    note: string | null;
  }[]) {
    (schedulesByCenter[r.scope_id] ??= []).push({
      id: r.id,
      scope: r.scope,
      scopeId: r.scope_id,
      price: r.price_per_session == null ? null : Number(r.price_per_session),
      currency: r.currency,
      effectiveFrom: r.effective_from,
      note: r.note,
    });
  }

  return <CentersManager centers={centers} rates={rates} schedulesByCenter={schedulesByCenter} />;
}
