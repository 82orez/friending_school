import { createAdminClient } from "@/utils/supabase/admin";
import CentersManager, { type AdminCenter } from "@/components/admin/CentersManager";
import { FOREIGN_CURRENCIES, ratesFromSettings } from "@/data/currencies";
import type { RateRow } from "@/lib/rates";

export default async function AdminCentersPage() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("centers")
    .select("id, name, sort_order, created_at, price_per_session, price_currency, manager_name, manager_id")
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

  // 매니저 계정 후보 — 가입 회원(이메일 인증 완료) 목록. 회원 관리와 동일 listUsers+profiles 병합 패턴.
  const { data: usersData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const { data: profs } = await admin.from("profiles").select("id, first_name, last_name");
  const profById = new Map(((profs ?? []) as { id: string; first_name: string | null; last_name: string | null }[]).map((p) => [p.id, p]));
  const users = (usersData?.users ?? [])
    .filter((u) => u.email && u.email_confirmed_at)
    .map((u) => {
      const p = profById.get(u.id);
      const nm = p ? [p.last_name, p.first_name].filter(Boolean).join("") : "";
      return { id: u.id, label: nm ? `${nm} (${u.email})` : (u.email as string), email: u.email as string };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "ko"));

  return <CentersManager centers={centers} rates={rates} schedulesByCenter={schedulesByCenter} users={users} />;
}
