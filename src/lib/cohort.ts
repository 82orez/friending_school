// 코호트(월별) 전개 — 수강료 선수취 / 강사 정산 후지급의 시점차 모델링. 순수 로직(서버·클라 공용).
//
// 왜 필요한가: 매출은 결제일에 100% 인식되지만(`revenue.ts` kstDate) 정산은 수업 진행일에 회차별로
// 인식된다(`settlements.ts` sessionDate). `/admin/profit`은 이 둘을 서로 다른 날짜로 필터하므로
// (`ProfitManager.tsx:102-103`) 신규 유입이 변하는 국면에서 대시보드 이익 ≠ 건별 매칭 이익이 된다.
// 정상상태에서는 상쇄되지만 램프업 초기엔 대시보드가 이익을 부풀려 보여준다.
//
// 이 모듈은 DB를 읽지 않는다 — `simulate()` 결과에 월별 신규 건수(arrivals)를 얹어 전개만 한다.

import { WEEKS_PER_MONTH, type SimInputs, type SimResult } from "./simulation";

// 정산 분산 계산의 적분 해상도(시작일이 월 내 균등분포라고 보고 적분).
const STEPS = 1000;
// 분산 배열 꼬리를 자르는 임계(이 미만 비중은 버리고 마지막 달에 합산).
const EPS = 1e-6;

/**
 * 신청(결제) 월을 M+0으로 볼 때, 정산 원가가 M+0·M+1·M+2… 에 떨어지는 비중.
 *
 * 모델: 수업이 기간 L(개월)에 걸쳐 균등 제공되고, 과정 시작일이 월 내에 균등분포한다고 가정해
 * 시작 오프셋 u∈[0,1)에 대해 구간 [u, u+L]과 [k, k+1]의 겹침 기대값을 적분한다.
 * 요일 선택·월 길이에 비종속이라 TZ 안전하고 결정적이다(실제 수업 달력 시뮬레이션과 ±1.5pp 이내).
 *
 * 반환 배열의 합은 항상 1.
 */
export function settlementSpread(totalSessions: number, sessionsPerWeek: number): number[] {
  const perWeek = Number.isFinite(sessionsPerWeek) && sessionsPerWeek > 0 ? sessionsPerWeek : 0;
  const total = Number.isFinite(totalSessions) && totalSessions > 0 ? totalSessions : 0;
  // 빈도·회차가 없으면 전액 당월 인식으로 처리(분산 없음).
  if (!perWeek || !total) return [1];

  const months = total / perWeek / WEEKS_PER_MONTH; // 과정 기간(개월)
  if (!(months > 0)) return [1];

  const span = Math.ceil(months) + 1; // 겹칠 수 있는 최대 달 수
  const acc = new Array<number>(span).fill(0);

  // u를 0→1로 훑으며 각 달과의 겹침 길이를 누적(사다리꼴 대신 중점법).
  for (let i = 0; i < STEPS; i++) {
    const u = (i + 0.5) / STEPS;
    for (let k = 0; k < span; k++) {
      const overlap = Math.min(u + months, k + 1) - Math.max(u, k);
      if (overlap > 0) acc[k] += overlap;
    }
  }

  // 정규화(합=1) 후 꼬리 정리.
  const sum = acc.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) return [1];
  const norm = acc.map((v) => v / sum);

  let last = norm.length - 1;
  while (last > 0 && norm[last] < EPS) last--;
  const out = norm.slice(0, last + 1);
  // 절삭분을 마지막 달에 흡수해 합=1 보장(부동소수 잔차 포함).
  const kept = out.reduce((a, b) => a + b, 0);
  out[out.length - 1] += 1 - kept;
  return out;
}

export type CohortMonth = {
  month: number; // 1-based
  arrivals: number; // 그 달 신규 수강신청 건수
  supply: number; // 공급가액(결제일 인식)
  pgFee: number;
  settlement: number; // 그 달 진행된 수업의 정산액(과거 코호트 포함)
  dashboardProfit: number; // = /admin/profit이 그 달에 보여줄 값
  economicProfit: number; // = 신규 건수 × 건당 매출이익(건별 매칭)
  gap: number; // dashboardProfit − economicProfit (양수 = 대시보드 과대)
  deferredRevenue: number; // 월말 선수금 잔고(미제공 회차분 수강료 = 환불 시 반환 의무)
  unpaidTeacherCost: number; // 그중 아직 지급하지 않은 강사 원가
};

/**
 * 월별 신규 건수(arrivals)를 받아 코호트를 전개한다.
 * `r`은 `simulate(inputs)` 결과 — 건당 공급가액·정산·PG·이익을 그대로 재사용해 정상상태 계산과 정합.
 */
export function projectCohorts(r: SimResult, inputs: SimInputs, arrivals: number[]): CohortMonth[] {
  const spread = settlementSpread(inputs.totalSessions, inputs.sessionsPerWeek);
  const tuition = Number.isFinite(inputs.tuitionKrw) && inputs.tuitionKrw > 0 ? inputs.tuitionKrw : 0;

  // 누적 제공 비율(정산 분산과 동일한 진도로 수업이 제공된다고 봄) — 선수금 잔고 산출용.
  const cumulative: number[] = [];
  let run = 0;
  for (const s of spread) {
    run += s;
    cumulative.push(run);
  }

  const out: CohortMonth[] = [];
  for (let m = 0; m < arrivals.length; m++) {
    const n = Math.max(0, arrivals[m] ?? 0);

    // 이번 달 정산 = 이번 달 및 과거 코호트가 이번 달에 유발한 정산의 합.
    let settlement = 0;
    for (let i = 0; i < spread.length; i++) {
      const src = arrivals[m - i];
      if (m - i >= 0 && src > 0) settlement += src * r.settlementPerEnrollment * spread[i];
    }

    // 월말 선수금 = 아직 제공하지 않은 회차분 수강료(코호트별 잔여 비율 × 결제액).
    let deferredRevenue = 0;
    let unpaidTeacherCost = 0;
    for (let j = 0; j <= m; j++) {
      const src = arrivals[j] ?? 0;
      if (src <= 0) continue;
      const age = m - j;
      const delivered = age < cumulative.length ? cumulative[age] : 1;
      const remain = Math.max(0, 1 - delivered);
      deferredRevenue += src * tuition * remain;
      unpaidTeacherCost += src * r.settlementPerEnrollment * remain;
    }

    const supply = n * r.supplyPerEnrollment;
    const pgFee = n * r.pgFeePerEnrollment;
    const dashboardProfit = supply - settlement - pgFee;
    const economicProfit = n * r.profitPerEnrollment;

    out.push({
      month: m + 1,
      arrivals: n,
      supply,
      pgFee,
      settlement,
      dashboardProfit,
      economicProfit,
      gap: dashboardProfit - economicProfit,
      deferredRevenue,
      unpaidTeacherCost,
    });
  }
  return out;
}

/** 대시보드 이익과 경제적 이익이 사실상 일치하기 시작하는 달(1-based). 없으면 null. */
export function convergenceMonth(rows: CohortMonth[], tolerance = 0.01): number | null {
  for (const row of rows) {
    const base = Math.abs(row.economicProfit);
    if (base < 1) continue;
    if (Math.abs(row.gap) / base <= tolerance) return row.month;
  }
  return null;
}

/** 램프 시나리오 → 월별 신규 건수 배열. rampMonths=1이면 첫 달부터 목표치. */
export function buildArrivals(target: number, months: number, startCount: number, rampMonths: number): number[] {
  const t = Math.max(0, Math.round(target || 0));
  const s = Math.max(0, Math.round(startCount || 0));
  const ramp = Math.max(1, Math.round(rampMonths || 1));
  const out: number[] = [];
  for (let m = 0; m < months; m++) {
    if (m >= ramp - 1) out.push(t);
    else out.push(Math.round(s + ((t - s) * m) / (ramp - 1 || 1)));
  }
  return out;
}
