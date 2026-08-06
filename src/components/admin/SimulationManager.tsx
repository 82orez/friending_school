"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { CURRENCIES, formatPrice } from "@/data/currencies";
import { simulate, sensitivity, type SimInputs, type SensitivityAxis } from "@/lib/simulation";
import { settlementSpread, projectCohorts, convergenceMonth, buildArrivals } from "@/lib/cohort";

// 목표 시뮬레이터 — "월 매출이익 목표 → 필요 월 신청 건수" 역산(읽기 전용, 서버 호출 없음).
// 이익 정의·반올림은 /admin/profit과 동일(공급가액 − 정산 − PG 수수료). 고정비는 미반영(공헌이익).
// 두 뷰: 정상상태(유입이 일정할 때의 균형점) · 월별 전개(선수취/후지급 시점차로 생기는 과도구간).

export type CenterPreset = { id: string; name: string; price: number | null; currency: string; fxRate: number };

const INPUT = "border-rule-faint focus:border-accent-blue w-full rounded-md border bg-white px-3 py-2 text-sm outline-none";
const SELECT = "border-rule-faint focus:border-accent-blue h-[42px] w-full rounded-md border bg-white px-3 text-sm outline-none";
const LABEL = "text-muted-fg-faint mb-1 block text-xs font-semibold";

const AXIS_LABEL: Record<SensitivityAxis, string> = { rate: "회당 단가", fx: "환율", tuition: "수강료" };
const AXES: SensitivityAxis[] = ["rate", "fx", "tuition"];

type View = "steady" | "monthly";
const VIEWS: { key: View; label: string }[] = [
  { key: "steady", label: "정상상태" },
  { key: "monthly", label: "월별 전개" },
];
const PROJECTION_MONTHS = 12;

// 숫자 입력은 빈 문자열을 허용해야 지우고 다시 칠 수 있어 문자열 state로 두고 계산 시점에만 Number().
const n = (s: string): number => {
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
};

export default function SimulationManager({
  centers,
  defaults,
  fxByCurrency,
  asOf,
}: {
  centers: CenterPreset[];
  defaults: { tuitionKrw: number; totalSessions: number; ratePerSession: number; rateCurrency: string; fxRate: number; pgFeeRatePercent: number };
  fxByCurrency: Record<string, number>;
  asOf: string;
}) {
  const [target, setTarget] = useState("5000000");
  const [tuition, setTuition] = useState(String(defaults.tuitionKrw));
  const [sessions, setSessions] = useState(String(defaults.totalSessions));
  const [rate, setRate] = useState(String(defaults.ratePerSession));
  const [currency, setCurrency] = useState(defaults.rateCurrency);
  const [fx, setFx] = useState(String(defaults.fxRate));
  const [pgFee, setPgFee] = useState(String(defaults.pgFeeRatePercent));
  const [cardShare, setCardShare] = useState("100");
  const [perWeek, setPerWeek] = useState("3");
  const [slotsPerTeacher, setSlotsPerTeacher] = useState("30");
  const [axis, setAxis] = useState<SensitivityAxis>("rate");
  const [view, setView] = useState<View>("steady");
  // 월별 전개 — 램프 시나리오(시작 건수 · 목표 도달까지 개월 수 · 이후 중단 여부).
  const [rampStart, setRampStart] = useState("8");
  const [rampMonths, setRampMonths] = useState("4");
  const [stopAfter, setStopAfter] = useState("0"); // 0 = 중단 없음, N = N개월차 이후 신규 0

  const inputs: SimInputs = useMemo(
    () => ({
      targetProfitKrw: n(target),
      tuitionKrw: n(tuition),
      totalSessions: n(sessions),
      ratePerSession: n(rate),
      rateCurrency: currency,
      fxRate: n(fx),
      pgFeeRatePercent: n(pgFee),
      cardSharePercent: n(cardShare),
      sessionsPerWeek: n(perWeek),
      slotsPerTeacherWeek: n(slotsPerTeacher),
    }),
    [target, tuition, sessions, rate, currency, fx, pgFee, cardShare, perWeek, slotsPerTeacher],
  );

  const r = useMemo(() => simulate(inputs), [inputs]);
  const isKrw = currency === "KRW";

  // 통화를 바꾸면 그 통화의 오늘 환율로 자동 교체(KRW는 환산 불필요).
  const onCurrency = (code: string) => {
    setCurrency(code);
    if (code !== "KRW") setFx(String(fxByCurrency[code] ?? 0));
  };

  const applyPreset = (c: CenterPreset) => {
    if (c.price == null) return;
    setRate(String(c.price));
    setCurrency(c.currency);
    setFx(String(c.currency === "KRW" ? 0 : (fxByCurrency[c.currency] ?? c.fxRate ?? 0)));
  };

  // 민감도 축별 표본값 — 현재 입력값을 항상 포함해 KPI와 대조 가능하게.
  const sensitivityRows = useMemo(() => {
    const cur = axis === "rate" ? n(rate) : axis === "fx" ? n(fx) : n(tuition);
    const base =
      axis === "rate"
        ? isKrw
          ? [2000, 3000, 4000, 5000, 7000, 10000]
          : [85, 100, 120, 150, 200, 300]
        : axis === "fx"
          ? [20, 25, 28, 30, 35, 40]
          : [180000, 200000, 240000, 280000, 300000, 350000];
    const values = Array.from(new Set([...base, cur].filter((v) => v > 0))).sort((a, b) => a - b);
    return sensitivity(inputs, axis, values).map((row) => ({ ...row, isCurrent: row.value === cur }));
  }, [axis, inputs, rate, fx, tuition, isKrw]);

  const krw = (v: number | null) => (v == null ? "—" : formatPrice(Math.round(v), "KRW"));

  // ── 월별 전개 ──
  const spread = useMemo(() => settlementSpread(n(sessions), n(perWeek)), [sessions, perWeek]);
  const arrivals = useMemo(() => {
    const target = r.requiredEnrollments ?? 0;
    const base = buildArrivals(target, PROJECTION_MONTHS, n(rampStart), n(rampMonths));
    const stop = Math.round(n(stopAfter));
    return stop > 0 ? base.map((v, i) => (i >= stop ? 0 : v)) : base;
  }, [r.requiredEnrollments, rampStart, rampMonths, stopAfter]);
  const cohorts = useMemo(() => projectCohorts(r, inputs, arrivals), [r, inputs, arrivals]);
  const converge = useMemo(() => convergenceMonth(cohorts), [cohorts]);
  const peakDeferred = useMemo(() => Math.max(0, ...cohorts.map((c) => c.deferredRevenue)), [cohorts]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-ink text-xl font-extrabold">🎯 목표 시뮬레이션</h1>
          <p className="text-muted-fg-faint mt-1 text-xs">
            목표 월 매출이익을 달성하는 데 필요한 월 평균 수강신청 건수를 역산합니다. 이익 정의는 매출이익 대시보드와 동일(공급가액 − 정산 − PG
            수수료).
          </p>
        </div>
        <p className="text-muted-fg-faint text-xs">기본값 기준일 {asOf}</p>
      </div>

      {/* ── 입력 ── */}
      <div className="border-rule mt-5 rounded-xl border bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-ink text-base font-bold">입력값</p>
          {centers.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-fg-faint text-xs font-semibold">센터 단가 프리셋</span>
              {centers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={c.price == null}
                  onClick={() => applyPreset(c)}
                  className="border-rule text-muted-fg hover:border-accent-blue hover:text-accent-blue-ink rounded-full border bg-white px-3 py-1 text-xs font-medium transition-colors disabled:opacity-40"
                >
                  {c.name} {c.price == null ? "(미설정)" : formatPrice(c.price, c.currency)}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div>
            <label className={LABEL}>목표 월 매출이익 (원)</label>
            <input type="number" min={0} step={100000} value={target} onChange={(e) => setTarget(e.target.value)} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>수강료 (원, 부가세 포함)</label>
            <input type="number" min={0} step={10000} value={tuition} onChange={(e) => setTuition(e.target.value)} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>총 회차</label>
            <input type="number" min={1} step={1} value={sessions} onChange={(e) => setSessions(e.target.value)} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>주당 수업 횟수</label>
            <input type="number" min={1} max={7} step={1} value={perWeek} onChange={(e) => setPerWeek(e.target.value)} className={INPUT} />
          </div>

          <div>
            <label className={LABEL}>단가 통화</label>
            <select value={currency} onChange={(e) => onCurrency(e.target.value)} className={SELECT}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>강사 회당 단가</label>
            <input
              type="number"
              min={0}
              step={currency === "USD" ? 0.1 : 1}
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>환율 (1단위당 원)</label>
            <input
              type="number"
              min={0}
              step={0.5}
              value={isKrw ? "" : fx}
              onChange={(e) => setFx(e.target.value)}
              disabled={isKrw}
              placeholder={isKrw ? "환산 불필요" : ""}
              className={cn(INPUT, "disabled:bg-surface disabled:text-muted-fg-faint")}
            />
          </div>
          <div>
            <label className={LABEL}>PG 수수료율 (%)</label>
            <input type="number" min={0} step={0.1} value={pgFee} onChange={(e) => setPgFee(e.target.value)} className={INPUT} />
          </div>

          <div>
            <label className={LABEL}>카드 결제 비중 (%)</label>
            <input type="number" min={0} max={100} step={5} value={cardShare} onChange={(e) => setCardShare(e.target.value)} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>강사 1인 주당 슬롯</label>
            <input type="number" min={1} step={1} value={slotsPerTeacher} onChange={(e) => setSlotsPerTeacher(e.target.value)} className={INPUT} />
          </div>
        </div>
        <p className="text-muted-fg-faint mt-3 text-xs">
          무통장 입금은 PG 수수료가 없어 카드 비중만큼만 부과합니다. 슬롯 1개 = 30분(수업 25분 + 휴식 5분).
        </p>
      </div>

      {/* ── 결론 ── */}
      <div className="border-cta/30 bg-cta/5 mt-4 rounded-xl border p-5">
        <p className="text-muted-fg text-xs font-semibold">필요 월 평균 수강신청 건수</p>
        {r.requiredEnrollments == null ? (
          <>
            <p className="text-brand mt-1 text-3xl font-extrabold">달성 불가</p>
            <p className="text-brand mt-1 text-xs">
              {r.profitPerEnrollment <= 0
                ? `건당 매출이익이 ${krw(r.profitPerEnrollment)}으로 0 이하입니다. 건수를 늘려도 목표에 도달할 수 없습니다.`
                : "목표 이익을 0보다 크게 입력해 주세요."}
            </p>
          </>
        ) : (
          <>
            <p className="text-cta mt-1 text-4xl font-extrabold">
              {r.requiredEnrollments.toLocaleString()}
              <span className="text-ink ml-1 text-xl font-bold">건 / 월</span>
            </p>
            <p className="text-muted-fg mt-1 text-xs">
              건당 매출이익 {krw(r.profitPerEnrollment)} × {r.requiredEnrollments}건 = {krw(r.monthlyProfit)} (목표 {krw(n(target))})
            </p>
          </>
        )}
      </div>

      {/* ── 건당 손익 KPI ── */}
      <p className="text-ink mt-6 text-base font-bold">수강신청 1건당 손익</p>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <KpiCard label="매출(총액)" value={krw(n(tuition))} hint="부가세 포함 수강료" />
        <KpiCard label="공급가액" value={krw(r.supplyPerEnrollment)} hint="수강료 ÷ 1.1 (이익 베이스)" />
        <KpiCard label="부가세" value={krw(r.vatPerEnrollment)} hint="납부 대상(이익 제외)" />
        <KpiCard
          label="정산"
          value={krw(r.settlementPerEnrollment)}
          hint={
            r.settlementPerSessionKrw == null
              ? "환율 미설정 — 0으로 계산됨"
              : `회당 ${formatPrice(r.settlementPerSessionKrw, "KRW")} × ${n(sessions)}회`
          }
          tone="settlement"
        />
        <KpiCard label="PG 수수료" value={krw(r.pgFeePerEnrollment)} hint={`카드 비중 ${n(cardShare)}% 가중`} tone="settlement" />
        <KpiCard
          label="매출이익"
          value={krw(r.profitPerEnrollment)}
          hint="공급가액 − 정산 − PG 수수료"
          tone={r.profitPerEnrollment >= 0 ? "profit" : "loss"}
        />
      </div>
      <p className="text-muted-fg-faint mt-2 text-xs">
        이익률 {r.marginPercent == null ? "—" : `${r.marginPercent.toFixed(1)}%`} (매출이익 ÷ 공급가액)
      </p>

      {r.fxMissing && (
        <p className="bg-brand/5 border-brand/30 text-brand mt-3 rounded-lg border px-3 py-2 text-xs">
          환율이 설정되지 않아 정산 원가가 0으로 계산되었습니다. 매출이익이 실제보다 크게 나옵니다 — 센터 관리에서 환율을 등록하세요.
        </p>
      )}

      {/* ── 뷰 토글 ── */}
      <div className="border-rule mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 border-b pb-3">
        <div className="flex gap-1.5">
          {VIEWS.map((v) => (
            <ToggleChip key={v.key} active={view === v.key} onClick={() => setView(v.key)} label={v.label} />
          ))}
        </div>
        <span className="text-muted-fg-faint text-xs">
          {view === "steady"
            ? "유입이 일정할 때의 균형점입니다."
            : "수강료는 결제일에 전액, 정산은 수업 진행일에 나뉘어 인식됩니다. 그 시점차가 만드는 과도구간을 봅니다."}
        </span>
      </div>

      {/* ── 운영 부하 ── */}
      {view === "steady" && r.requiredEnrollments != null && (
        <>
          <p className="text-ink mt-6 text-base font-bold">
            운영 부하 <span className="text-muted-fg-faint text-xs font-normal">주 {n(perWeek)}회 · 목표 건수 기준 정상상태</span>
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <KpiCard
              label="과정 기간"
              value={`${r.courseWeeks.toFixed(r.courseWeeks % 1 === 0 ? 0 : 1)}주`}
              hint={`약 ${r.courseMonths.toFixed(2)}개월`}
            />
            <KpiCard label="동시 수강생" value={`${Math.round(r.activeStudents ?? 0).toLocaleString()}명`} hint="신청률 × 과정 기간" />
            <KpiCard label="월 수업 횟수" value={`${(r.monthlySessions ?? 0).toLocaleString()}회`} hint="필요 건수 × 총 회차" />
            <KpiCard label="주당 슬롯" value={`${Math.round(r.weeklySlots ?? 0).toLocaleString()}슬롯`} hint="30분 단위" />
            <KpiCard
              label="필요 강사 수"
              value={r.teachersNeeded == null ? "—" : `${Math.ceil(r.teachersNeeded).toLocaleString()}명`}
              hint={`1인 주 ${n(slotsPerTeacher)}슬롯 기준`}
            />
          </div>
          <p className="text-muted-fg-faint mt-2 text-xs">
            주당 횟수는 필요 건수를 바꾸지 않습니다 — 건당 손익이 총 회차 기준이라 빈도와 무관하며, 과정 기간·동시 수강생·강사 소요만 달라집니다.
          </p>

          {/* ── 목표 달성 시 월 손익(= /admin/profit KPI 대조용) ── */}
          <p className="text-ink mt-6 text-base font-bold">목표 달성 시 월 손익</p>
          <div className="border-rule mt-3 overflow-x-auto rounded-xl border bg-white">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <tbody>
                {[
                  { label: "매출 (부가세 포함)", value: r.monthlyGross },
                  { label: "공급가액", value: r.monthlySupply },
                  { label: "부가세 (납부분)", value: r.monthlyVat },
                  { label: "정산 (강사 인건비)", value: r.monthlySettlement },
                  { label: "PG 수수료", value: r.monthlyPgFee },
                ].map((row) => (
                  <tr key={row.label} className="border-rule border-b last:border-b-0">
                    <td className="text-muted-fg px-4 py-2.5 md:px-6">{row.label}</td>
                    <td className="text-ink px-4 py-2.5 text-right font-semibold md:px-6">{krw(row.value)}</td>
                  </tr>
                ))}
                <tr className="border-rule bg-surface border-t-2">
                  <td className="text-ink px-4 py-3 font-bold md:px-6">매출이익</td>
                  <td
                    className={cn(
                      "px-4 py-3 text-right text-base font-extrabold md:px-6",
                      (r.monthlyProfit ?? 0) >= 0 ? "text-accent-blue-ink" : "text-brand",
                    )}
                  >
                    {krw(r.monthlyProfit)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── 월별 전개(코호트) ── */}
      {view === "monthly" && r.requiredEnrollments != null && (
        <>
          {/* 램프 시나리오 */}
          <div className="border-rule mt-6 rounded-xl border bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-ink text-base font-bold">유입 시나리오</p>
              <div className="flex flex-wrap gap-1.5">
                <PresetChip
                  label="즉시 목표 달성"
                  active={n(rampMonths) <= 1 && n(stopAfter) === 0}
                  onClick={() => {
                    setRampStart(String(r.requiredEnrollments ?? 0));
                    setRampMonths("1");
                    setStopAfter("0");
                  }}
                />
                <PresetChip
                  label="점진 램프"
                  active={n(rampMonths) > 1 && n(stopAfter) === 0}
                  onClick={() => {
                    setRampStart("8");
                    setRampMonths("4");
                    setStopAfter("0");
                  }}
                />
                <PresetChip
                  label="3개월 후 신규 0"
                  active={n(stopAfter) > 0}
                  onClick={() => {
                    setRampStart(String(r.requiredEnrollments ?? 0));
                    setRampMonths("1");
                    setStopAfter("3");
                  }}
                />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div>
                <label className={LABEL}>1개월차 신규 건수</label>
                <input type="number" min={0} step={1} value={rampStart} onChange={(e) => setRampStart(e.target.value)} className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>목표 도달까지 (개월)</label>
                <input type="number" min={1} max={12} step={1} value={rampMonths} onChange={(e) => setRampMonths(e.target.value)} className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>신규 중단 시점 (0=없음)</label>
                <input type="number" min={0} max={12} step={1} value={stopAfter} onChange={(e) => setStopAfter(e.target.value)} className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>목표 건수</label>
                <input type="number" value={r.requiredEnrollments} readOnly className={cn(INPUT, "bg-surface text-muted-fg")} />
              </div>
            </div>
          </div>

          {/* 정산 분산 */}
          <p className="text-ink mt-6 text-base font-bold">
            정산 원가가 흩어지는 모양{" "}
            <span className="text-muted-fg-faint text-xs font-normal">신청 1건({krw(r.settlementPerEnrollment)})이 어느 달에 나가는가</span>
          </p>
          <div className="border-rule mt-3 rounded-xl border bg-white p-5">
            <div className="border-rule flex h-11 overflow-hidden rounded-lg border">
              {spread.map((s, i) => (
                <div
                  key={i}
                  style={{ width: `${s * 100}%` }}
                  className={cn(
                    "flex items-center justify-center overflow-hidden text-xs font-bold whitespace-nowrap",
                    i === 0 ? "bg-[#B45309] text-white" : i === 1 ? "bg-[#d98c12] text-white" : "bg-[#F5A623] text-white",
                  )}
                >
                  {s >= 0.08 ? `${(s * 100).toFixed(0)}%` : ""}
                </div>
              ))}
            </div>
            <div className="text-muted-fg mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-xs">
              {spread.map((s, i) => (
                <span key={i}>
                  <b className="text-ink">신청월{i === 0 ? "" : ` +${i}`}</b> {(s * 100).toFixed(1)}% · {krw(r.settlementPerEnrollment * s)}
                </span>
              ))}
            </div>
            <p className="text-muted-fg-faint mt-3 text-xs">
              수강료는 결제일에 전액 들어오지만 정산은 {spread.length}개월에 걸쳐 나갑니다. 이 때문에 유입이 늘거나 줄 때 매출이익 대시보드가 실제와
              어긋납니다.
            </p>
          </div>

          {/* 월별 표 */}
          <p className="text-ink mt-6 text-base font-bold">월별 전개</p>
          <div className="border-rule mt-3 overflow-x-auto rounded-xl border bg-white">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-rule bg-surface text-muted-fg-faint border-b text-left text-xs font-semibold">
                  <th className="px-4 py-2.5 md:px-6">월</th>
                  <th className="px-4 py-2.5 text-right">신규</th>
                  <th className="px-4 py-2.5 text-right">공급가액</th>
                  <th className="px-4 py-2.5 text-right">정산</th>
                  <th className="px-4 py-2.5 text-right">대시보드 이익</th>
                  <th className="px-4 py-2.5 text-right">실제 이익</th>
                  <th className="px-4 py-2.5 text-right md:px-6">선수금 잔고</th>
                </tr>
              </thead>
              <tbody>
                {cohorts.map((c) => {
                  const overstated = c.gap > 1;
                  return (
                    <tr
                      key={c.month}
                      className={cn("border-rule border-b last:border-b-0", converge != null && c.month === converge && "bg-accent-blue-soft")}
                    >
                      <td className="text-ink px-4 py-2.5 font-medium md:px-6">
                        {c.month}개월차
                        {converge != null && c.month === converge && (
                          <span className="text-accent-blue-ink ml-1.5 text-[11px] font-semibold">수렴</span>
                        )}
                      </td>
                      <td className="text-muted-fg px-4 py-2.5 text-right">{c.arrivals}건</td>
                      <td className="text-muted-fg px-4 py-2.5 text-right">{krw(c.supply)}</td>
                      <td className="px-4 py-2.5 text-right text-[#B45309]">{krw(c.settlement)}</td>
                      <td
                        className={cn(
                          "px-4 py-2.5 text-right font-bold",
                          c.dashboardProfit < 0 ? "text-brand" : overstated ? "text-[#B45309]" : "text-ink",
                        )}
                      >
                        {krw(c.dashboardProfit)}
                        {overstated && <span className="ml-1 text-[11px] font-semibold">▲</span>}
                      </td>
                      <td className="text-accent-blue-ink px-4 py-2.5 text-right font-bold">{krw(c.economicProfit)}</td>
                      <td className="text-muted-fg px-4 py-2.5 text-right md:px-6">{krw(c.deferredRevenue)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-muted-fg-faint mt-2 text-xs">
            <b className="text-[#B45309]">▲</b> = 대시보드가 실제보다 크게 보이는 달. <b>대시보드 이익</b>은 매출이익 페이지가 그 달에 보여줄
            값(결제일 매출 − 그 달 진행 수업 정산), <b>실제 이익</b>은 그 달 신청 건을 끝까지 매칭한 값입니다.
          </p>

          <div className="border-cta/30 bg-cta/5 mt-4 rounded-xl border p-5">
            <p className="text-ink text-sm font-bold">
              {converge == null
                ? "이 시나리오에서는 대시보드와 실제가 수렴하지 않습니다."
                : `${converge}개월차부터 대시보드와 실제 이익이 일치합니다.`}
            </p>
            <p className="text-muted-fg mt-1.5 text-xs">
              그 전까지는 정산이 아직 다 발생하지 않아 대시보드가 이익을 부풀려 보여줍니다. 오픈 직후 숫자를 성과로 오해하지 마세요.
              {peakDeferred > 0 && (
                <>
                  {" "}
                  또한 이 기간 최대 <b className="text-ink">{krw(peakDeferred)}</b>이 선수금(아직 제공하지 않은 수업의 대가)으로 잡힙니다 — 통장에
                  있어도 이익이 아니라 <b className="text-ink">환불 시 반환 의무가 있는 부채</b>입니다.
                </>
              )}
            </p>
          </div>
        </>
      )}

      {/* ── 민감도 ── */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="text-muted-fg-faint text-xs font-semibold">민감도</span>
        <div className="flex gap-1.5">
          {AXES.map((a) => (
            <ToggleChip key={a} active={axis === a} onClick={() => setAxis(a)} label={AXIS_LABEL[a]} />
          ))}
        </div>
        {axis === "fx" && isKrw && <span className="text-muted-fg-faint text-xs">단가가 원화라 환율은 영향이 없습니다.</span>}
      </div>
      <div className="border-rule mt-3 overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="border-rule bg-surface text-muted-fg-faint border-b text-left text-xs font-semibold">
              <th className="px-4 py-2.5 md:px-6">{AXIS_LABEL[axis]}</th>
              <th className="px-4 py-2.5 text-right">건당 매출이익</th>
              <th className="px-4 py-2.5 text-right md:px-6">필요 월 신청 건수</th>
            </tr>
          </thead>
          <tbody>
            {sensitivityRows.map((row) => (
              <tr key={row.value} className={cn("border-rule border-b last:border-b-0", row.isCurrent && "bg-accent-blue-soft")}>
                <td className="text-ink px-4 py-2.5 font-medium md:px-6">
                  {axis === "fx" ? `₩${row.value.toLocaleString()}` : formatPrice(row.value, axis === "rate" ? currency : "KRW")}
                  {row.isCurrent && <span className="text-accent-blue-ink ml-1.5 text-[11px] font-semibold">현재</span>}
                </td>
                <td className={cn("px-4 py-2.5 text-right", row.profit >= 0 ? "text-ink" : "text-brand")}>{krw(row.profit)}</td>
                <td className="px-4 py-2.5 text-right font-bold md:px-6">
                  {row.required == null ? <span className="text-brand">달성 불가</span> : `${row.required.toLocaleString()}건`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── 주의 ── */}
      <div className="border-rule bg-surface mt-6 rounded-xl border p-5">
        <p className="text-ink text-sm font-bold">이 시뮬레이션의 전제</p>
        <ul className="text-muted-fg mt-2 list-disc space-y-1.5 pl-5 text-xs">
          <li>
            <b>고정비 미반영</b> — 매출이익은 사무실·급여·마케팅 등을 빼기 전 공헌이익입니다. 실제 영업이익이 목표라면 필요 건수는{" "}
            <b>목표 + 월 고정비</b>로 다시 계산하세요.
          </li>
          <li>
            <b>정상상태 기준</b> — 위 필요 건수는 유입이 일정할 때의 균형점입니다. 매출은 결제일(현금주의), 정산은 수업 진행일(발생주의) 기준이라 오픈
            직후나 유입이 급변하는 구간에서는 대시보드 이익이 실제와 어긋납니다 — <b>「월별 전개」 뷰</b>에서 확인하세요.
          </li>
          <li>
            <b>단가 미설정 주의</b> — 소속 센터가 없는 강사의 수업은 실적 집계에서 원가 0으로 잡혀 실제 매출이익이 여기보다 낮을 수 있습니다.
          </li>
          <li>
            <b>이탈·환불 미반영</b> — 환불 시 잔여 수업이 일괄 취소되어 매출과 정산이 함께 줄어듭니다. 이탈률을 감안하려면 필요 건수를 상향하세요.
          </li>
        </ul>
      </div>
    </div>
  );
}

function KpiCard({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: "settlement" | "profit" | "loss" }) {
  return (
    <div className="border-rule rounded-xl border bg-white p-5">
      <p className="text-muted-fg-faint text-xs font-semibold">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-extrabold",
          tone === "settlement" ? "text-[#B45309]" : tone === "profit" ? "text-accent-blue-ink" : tone === "loss" ? "text-brand" : "text-ink",
        )}
      >
        {value}
      </p>
      <p className="text-muted-fg-faint mt-0.5 text-xs">{hint}</p>
    </div>
  );
}

// 유입 시나리오 프리셋 — ToggleChip보다 작은 보조 칩(센터 단가 프리셋과 동일 크기).
function PresetChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active ? "bg-ink border-ink text-white" : "border-rule text-muted-fg hover:border-accent-blue hover:text-accent-blue-ink bg-white",
      )}
    >
      {label}
    </button>
  );
}

function ToggleChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-ink border-ink text-white" : "border-rule text-muted-fg hover:border-accent-blue hover:text-accent-blue-ink bg-white",
      )}
    >
      {label}
    </button>
  );
}
