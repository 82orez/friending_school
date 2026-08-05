import { createAdminClient } from "@/utils/supabase/admin";
import SimulationManager, { type CenterPreset } from "@/components/admin/SimulationManager";
import { COURSE_PRICE_KRW } from "@/data/pricing";
import { TOTAL_SESSIONS } from "@/lib/availability";
import { effectiveRate, todayKstStr, type RateRow } from "@/lib/rates";
import { pgFeeRateAt, type PgFeeRow } from "@/lib/pgfee";
import { fxRateAt, type FxRow } from "@/lib/fx";
import { normalizeCurrency } from "@/data/currencies";

// 목표 시뮬레이션(읽기 전용) — "월 매출이익 목표 → 필요 월 신청 건수" 역산.
// 실적 대시보드(/admin/profit)가 과거를 보여준다면 여기는 미래 목표를 역산한다. 계산은 클라(SimulationManager),
// 서버는 '오늘 기준 유효값'(센터 단가·PG 수수료율·환율)을 실적과 동일한 역산 헬퍼로 뽑아 기본값으로만 넘긴다.
// 쓰기 없음(액션·마이그레이션 없음).
export default async function AdminSimulationPage() {
  const admin = createAdminClient();
  const today = todayKstStr();

  const [{ data: centerData }, { data: rateData }, { data: feeData }, { data: fxData }] = await Promise.all([
    admin.from("centers").select("id, name, sort_order").order("sort_order", { ascending: true }),
    admin.from("rate_schedules").select("id, scope, scope_id, price_per_session, currency, effective_from, note"),
    admin.from("pg_fee_schedules").select("id, rate_percent, effective_from, note"),
    admin.from("exchange_rate_schedules").select("id, currency, rate_to_krw, effective_from, note"),
  ]);

  // numeric 컬럼은 supabase-js가 문자열로 반환할 수 있어 Number() 강제(null 보존) — centers/settlements page와 동일.
  const rateRows: RateRow[] = ((rateData ?? []) as any[]).map((r) => ({
    id: r.id,
    scope: r.scope,
    scopeId: r.scope_id,
    price: r.price_per_session == null ? null : Number(r.price_per_session),
    currency: r.currency,
    effectiveFrom: r.effective_from,
    note: r.note,
  }));
  const feeRows: PgFeeRow[] = ((feeData ?? []) as any[]).map((r) => ({
    id: r.id,
    ratePercent: Number(r.rate_percent),
    effectiveFrom: r.effective_from,
    note: r.note,
  }));
  const fxRows: FxRow[] = ((fxData ?? []) as any[]).map((r) => ({
    id: r.id,
    currency: r.currency,
    rate: Number(r.rate_to_krw),
    effectiveFrom: r.effective_from,
    note: r.note,
  }));

  // 센터별 오늘 기준 유효 단가(강사 개별 오버라이드는 강사별이라 프리셋에선 센터 단가만) — effectiveRate에 teacherId를 빈 문자열로.
  const centers: CenterPreset[] = ((centerData ?? []) as { id: string; name: string }[]).map((c) => {
    const { price, currency } = effectiveRate(rateRows, "", c.id, today);
    const cur = normalizeCurrency(currency);
    return { id: c.id, name: c.name, price, currency: cur, fxRate: fxRateAt(fxRows, cur, today) };
  });

  // 기본 프리셋 = 단가가 설정된 첫 센터(없으면 KRW 0으로 시작).
  const preset = centers.find((c) => c.price != null);
  const defaultCurrency = preset?.currency ?? "KRW";

  return (
    <SimulationManager
      centers={centers}
      defaults={{
        tuitionKrw: COURSE_PRICE_KRW,
        totalSessions: TOTAL_SESSIONS,
        ratePerSession: preset?.price ?? 0,
        rateCurrency: defaultCurrency,
        fxRate: fxRateAt(fxRows, defaultCurrency, today),
        pgFeeRatePercent: pgFeeRateAt(feeRows, today),
      }}
      fxByCurrency={{ PHP: fxRateAt(fxRows, "PHP", today), USD: fxRateAt(fxRows, "USD", today) }}
      asOf={today}
    />
  );
}
