// 목표 매출이익 역산 시뮬레이션 — 순수 로직(서버·클라 공용, server-only 아님).
// /admin/profit의 실적 공식을 그대로 미러링해 "목표 이익 → 필요 월 신청 건수"를 역산한다.
//   매출이익 = 공급가액 − 정산 − PG 수수료   (ProfitManager.tsx의 profit = supply − settlement − pgFee)
// 부가세는 납부 대상이라 이익에서 제외, 고정비(사무실·급여·마케팅)는 미반영 = 공헌이익 성격.
// 반올림은 실적 로더와 동일 규칙(행별 반올림): vatSupply(vat.ts) · pgFeeOf(pgfee.ts) · Math.round(단가×환율)(fx.ts krwAtOrNull).

import { vatSupply } from "./vat";
import { pgFeeOf } from "./pgfee";

// 월 평균 주 수(365 ÷ 12 ÷ 7). 주 단위 수업량을 월 단위로 환산할 때 사용.
export const WEEKS_PER_MONTH = 365 / 12 / 7; // ≈ 4.3452

export type SimInputs = {
  targetProfitKrw: number; // 목표 월 매출이익(원)
  tuitionKrw: number; // 수강료(원, 부가세 포함 총액)
  totalSessions: number; // 과정 총 회차
  ratePerSession: number; // 강사 회당 단가(원통화 금액)
  rateCurrency: string; // 단가 통화(KRW/PHP/USD)
  fxRate: number; // 1단위당 원(₩). KRW면 무시
  pgFeeRatePercent: number; // PG 수수료율(%)
  cardSharePercent: number; // 카드 결제 비중(0~100). 무통장은 수수료 0이라 가중 적용
  sessionsPerWeek: number; // 주당 수업 횟수(주 3회 등)
  slotsPerTeacherWeek: number; // 강사 1인의 주당 가용 30분 슬롯 수
};

export type SimResult = {
  // ── 신청 1건당 ──
  supplyPerEnrollment: number; // 공급가액(이익 베이스)
  vatPerEnrollment: number; // 부가세(납부분, 이익 제외)
  settlementPerSessionKrw: number | null; // 회당 정산액(원). 외화인데 환율 미설정이면 null
  settlementPerEnrollment: number; // 정산 총액(원). 단가 미설정 시 0(실적 로더와 동일)
  pgFeePerEnrollment: number; // PG 수수료(카드 비중 가중)
  profitPerEnrollment: number; // 매출이익
  marginPercent: number | null; // 이익률(이익 ÷ 공급가액)

  // ── 목표 역산 ──
  requiredEnrollments: number | null; // 필요 월 신청 건수. 건당 이익 ≤ 0이면 null(달성 불가)
  fxMissing: boolean; // 외화 단가인데 환율 미설정 → 정산 0으로 계산됨(이익 과대)

  // ── 운영 부하(목표 건수 기준, 정상상태) ──
  courseWeeks: number; // 과정 기간(주)
  courseMonths: number; // 과정 기간(월)
  activeStudents: number | null; // 동시 진행 수강생(Little's Law: 신청률 × 기간)
  monthlySessions: number | null; // 월 수업 횟수
  weeklySlots: number | null; // 주당 30분 슬롯 수
  teachersNeeded: number | null; // 필요 강사 수

  // ── 목표 달성 시 월 손익(= /admin/profit KPI 대조용) ──
  monthlyGross: number | null;
  monthlySupply: number | null;
  monthlyVat: number | null;
  monthlySettlement: number | null;
  monthlyPgFee: number | null;
  monthlyProfit: number | null;
};

// 입력 정제 — 빈 문자열·NaN·음수를 0으로 눌러 NaN/Infinity가 UI로 새지 않게 한다.
const num = (v: number, min = 0): number => (Number.isFinite(v) && v > min ? v : min);

// 회당 단가를 원화로 — fx.ts krwAtOrNull과 동일(KRW 그대로, 외화는 반올림, 환율 미설정이면 null).
export function sessionRateKrw(ratePerSession: number, currency: string, fxRate: number): number | null {
  if (!currency || currency === "KRW") return ratePerSession;
  return fxRate > 0 ? Math.round(ratePerSession * fxRate) : null;
}

export function simulate(input: SimInputs): SimResult {
  const target = num(input.targetProfitKrw);
  const tuition = num(input.tuitionKrw);
  const totalSessions = Math.max(1, Math.round(num(input.totalSessions, 0)) || 1);
  const perWeek = num(input.sessionsPerWeek);
  const cardShare = Math.min(100, num(input.cardSharePercent));

  // 1건당 손익 — 실적 로더와 동일 반올림.
  const supplyPerEnrollment = vatSupply(tuition);
  const vatPerEnrollment = tuition - supplyPerEnrollment;

  const perSession = sessionRateKrw(num(input.ratePerSession), input.rateCurrency, num(input.fxRate));
  const fxMissing = perSession == null;
  const settlementPerEnrollment = (perSession ?? 0) * totalSessions; // 단가 미설정 = 0 처리(ProfitManager.tsx의 `?? 0`과 동일)

  // 무통장은 수수료 0이라 카드 비중만큼만 부과.
  const pgFeePerEnrollment = Math.round((pgFeeOf(tuition, num(input.pgFeeRatePercent)) * cardShare) / 100);

  const profitPerEnrollment = supplyPerEnrollment - settlementPerEnrollment - pgFeePerEnrollment;
  const marginPercent = supplyPerEnrollment > 0 ? (profitPerEnrollment / supplyPerEnrollment) * 100 : null;

  // 건당 이익이 0 이하면 건수를 아무리 늘려도 목표 도달 불가.
  const requiredEnrollments = profitPerEnrollment > 0 && target > 0 ? Math.ceil(target / profitPerEnrollment) : null;
  const n = requiredEnrollments;

  // 운영 부하 — 주당 횟수는 건당 손익을 바꾸지 않고(총 회차 동일) 기간·동시 수강생·강사 소요만 결정.
  const courseWeeks = perWeek > 0 ? totalSessions / perWeek : 0;
  const courseMonths = courseWeeks / WEEKS_PER_MONTH;
  const monthlySessions = n != null ? n * totalSessions : null;
  const weeklySlots = monthlySessions != null ? monthlySessions / WEEKS_PER_MONTH : null;
  const perTeacher = num(input.slotsPerTeacherWeek);

  return {
    supplyPerEnrollment,
    vatPerEnrollment,
    settlementPerSessionKrw: perSession,
    settlementPerEnrollment,
    pgFeePerEnrollment,
    profitPerEnrollment,
    marginPercent,
    requiredEnrollments,
    fxMissing,
    courseWeeks,
    courseMonths,
    activeStudents: n != null && courseMonths > 0 ? n * courseMonths : null,
    monthlySessions,
    weeklySlots,
    teachersNeeded: weeklySlots != null && perTeacher > 0 ? weeklySlots / perTeacher : null,
    monthlyGross: n != null ? n * tuition : null,
    monthlySupply: n != null ? n * supplyPerEnrollment : null,
    monthlyVat: n != null ? n * vatPerEnrollment : null,
    monthlySettlement: n != null ? n * settlementPerEnrollment : null,
    monthlyPgFee: n != null ? n * pgFeePerEnrollment : null,
    monthlyProfit: n != null ? n * profitPerEnrollment : null,
  };
}

// 축 하나만 바꿔가며 필요 건수를 뽑는 민감도 계산(나머지 입력 고정).
export type SensitivityAxis = "rate" | "fx" | "tuition";

export function sensitivity(base: SimInputs, axis: SensitivityAxis, values: number[]): { value: number; required: number | null; profit: number }[] {
  return values.map((value) => {
    const next: SimInputs =
      axis === "rate" ? { ...base, ratePerSession: value } : axis === "fx" ? { ...base, fxRate: value } : { ...base, tuitionKrw: value };
    const r = simulate(next);
    return { value, required: r.requiredEnrollments, profit: r.profitPerEnrollment };
  });
}
