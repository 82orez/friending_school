"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPrice, type Rates } from "@/data/currencies";
import type { RevenueRow } from "@/components/admin/RevenueManager";
import type { SettlementRow } from "@/components/admin/SettlementsManager";

// ── TZ 비종속 날짜 헬퍼(server-only 헬퍼 재사용 불가 → 인라인) ──
// 정산은 월 단위로 이뤄져 주간 집계는 의미가 없어 매출이익은 월간·년간만 지원(주간 없음).
const todayKst = (): string => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
const monthStart = (d: string): string => `${d.slice(0, 7)}-01`;
const monthEnd = (d: string): string => {
  const [y, m] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
const shiftMonth = (d: string, delta: number): string => {
  const [y, m] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 10);
};

type Period = "월간" | "년간";
const PERIODS: Period[] = ["월간", "년간"];
type Grouping = "센터별" | "과정별" | "강사별";
const GROUPINGS: Grouping[] = ["센터별", "과정별", "강사별"];
type SortKey = "name" | "revenue" | "settlement" | "profit";

function interval(anchor: string, period: Period): { start: string; end: string } {
  if (period === "년간") return { start: `${anchor.slice(0, 4)}-01-01`, end: `${anchor.slice(0, 4)}-12-31` };
  return { start: monthStart(anchor), end: monthEnd(anchor) };
}
function periodLabel(anchor: string, period: Period): string {
  if (period === "년간") return `${anchor.slice(0, 4)}년`;
  const [y, m] = anchor.split("-");
  return `${y}년 ${Number(m)}월`;
}
function shiftAnchor(anchor: string, period: Period, delta: number): string {
  if (period === "년간") return shiftMonth(anchor, delta * 12);
  return shiftMonth(anchor, delta);
}

// 매출 1건 순액(KRW) — 로더가 결제일 환율로 사전 환산.
const revenueNetKrw = (r: RevenueRow): number => r.krwAmount - r.krwCancelledAmount;
// 정산 1건 원가(KRW) — 로더가 수업 진행일 환율로 사전 환산, 단가 미설정이면 0.
const settlementKrw = (s: SettlementRow): number => s.krwPerSession ?? 0;

type TrendBucket = { key: string; revenue: number; settlement: number; tooltip: string; xLabel: string; highlight?: boolean };
type ProfitGroup = { key: string; label: string; revenueKrw: number; settlementKrw: number; unpriced: number };

export default function ProfitManager({ revenueRows, settlementRows, rates }: { revenueRows: RevenueRow[]; settlementRows: SettlementRow[]; rates: Rates }) {
  const [period, setPeriod] = useState<Period>("월간");
  const [anchor, setAnchor] = useState<string>(() => todayKst());
  const [grouping, setGrouping] = useState<Grouping>("센터별");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const [includeTest, setIncludeTest] = useState(false);

  const hasTest = useMemo(() => revenueRows.some((r) => r.isTest) || settlementRows.some((s) => s.isTest), [revenueRows, settlementRows]);
  const toggleSort = (key: SortKey) => setSort((prev) => (prev?.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const { start, end } = useMemo(() => interval(anchor, period), [anchor, period]);
  // 테스트 결제·수강(is_test)은 기본 제외(운영 정확도), 토글 시 포함 — 매출·정산 양쪽 동일 적용.
  const baseRev = useMemo(() => (includeTest ? revenueRows : revenueRows.filter((r) => !r.isTest)), [revenueRows, includeTest]);
  const baseSet = useMemo(() => (includeTest ? settlementRows : settlementRows.filter((s) => !s.isTest)), [settlementRows, includeTest]);
  const inRev = useMemo(() => baseRev.filter((r) => r.kstDate >= start && r.kstDate <= end), [baseRev, start, end]);
  const inSet = useMemo(() => baseSet.filter((s) => s.sessionDate >= start && s.sessionDate <= end), [baseSet, start, end]);

  // KPI(기간 내). 매출=결제일 기준 순매출, 정산=수업 진행일 기준 지급 예정액, 이익=매출−정산.
  const kpi = useMemo(() => {
    let revenue = 0;
    for (const r of inRev) revenue += revenueNetKrw(r);
    let settlement = 0;
    let unpriced = 0;
    for (const s of inSet) {
      settlement += settlementKrw(s);
      if (s.pricePerSession == null || !s.currency) unpriced += 1;
    }
    const profit = revenue - settlement;
    return { revenue, settlement, profit, margin: revenue > 0 ? (profit / revenue) * 100 : null, unpriced };
  }, [inRev, inSet, rates]);

  // 추이 차트 버킷(매출·정산 2계열) — 월간=앵커 연도 12개월, 년간=연도 범위(선택 구간 강조).
  const trend = useMemo<TrendBucket[]>(() => {
    if (period === "년간") {
      const rev = new Map<number, number>();
      const set = new Map<number, number>();
      for (const r of baseRev) rev.set(Number(r.kstDate.slice(0, 4)), (rev.get(Number(r.kstDate.slice(0, 4))) ?? 0) + revenueNetKrw(r));
      for (const s of baseSet) set.set(Number(s.sessionDate.slice(0, 4)), (set.get(Number(s.sessionDate.slice(0, 4))) ?? 0) + settlementKrw(s));
      const anchorY = Number(anchor.slice(0, 4));
      let minY = anchorY;
      let maxY = anchorY;
      for (const yr of [...Array.from(rev.keys()), ...Array.from(set.keys())]) {
        if (yr < minY) minY = yr;
        if (yr > maxY) maxY = yr;
      }
      const out: TrendBucket[] = [];
      for (let yr = minY; yr <= maxY; yr++) {
        const revenue = rev.get(yr) ?? 0;
        const settlement = set.get(yr) ?? 0;
        out.push({ key: String(yr), revenue, settlement, tooltip: tooltipOf(`${yr}년`, revenue, settlement), xLabel: `${yr}`, highlight: yr === anchorY });
      }
      return out;
    }
    // 월간: 앵커 연도 12개월(선택 월 강조).
    const y = anchor.slice(0, 4);
    const rev = new Map<number, number>();
    const set = new Map<number, number>();
    for (const r of baseRev) if (r.kstDate.slice(0, 4) === y) rev.set(Number(r.kstDate.slice(5, 7)), (rev.get(Number(r.kstDate.slice(5, 7))) ?? 0) + revenueNetKrw(r));
    for (const s of baseSet) if (s.sessionDate.slice(0, 4) === y) set.set(Number(s.sessionDate.slice(5, 7)), (set.get(Number(s.sessionDate.slice(5, 7))) ?? 0) + settlementKrw(s));
    const selMonth = Number(anchor.slice(5, 7));
    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const revenue = rev.get(m) ?? 0;
      const settlement = set.get(m) ?? 0;
      return { key: `${y}-${m}`, revenue, settlement, tooltip: tooltipOf(`${y}년 ${m}월`, revenue, settlement), xLabel: `${m}월`, highlight: m === selMonth };
    });
  }, [inRev, inSet, baseRev, baseSet, start, end, rates, period, anchor]);

  // 분류별 매출이익(매출·정산을 각 key로 집계 후 키 합집합 병합).
  const groups = useMemo(() => {
    const revKeyOf = (r: RevenueRow): { key: string; label: string } => {
      if (grouping === "센터별") return { key: r.centerId ?? "__none__", label: r.centerName ?? "미지정 센터" };
      if (grouping === "과정별") return { key: r.course ?? "__none__", label: r.courseTitle ?? "미지정 과정" };
      return { key: r.teacherId ?? "__none__", label: r.teacherName ?? "미지정 강사" };
    };
    const setKeyOf = (s: SettlementRow): { key: string; label: string } => {
      if (grouping === "센터별") return { key: s.centerId ?? "__none__", label: s.centerName ?? "미지정 센터" };
      if (grouping === "과정별") return { key: s.course ?? "__none__", label: s.courseTitle ?? "미지정 과정" };
      return { key: s.teacherId ?? "__none__", label: s.teacherName ?? "미지정 강사" };
    };
    const map = new Map<string, ProfitGroup>();
    const ensure = (key: string, label: string): ProfitGroup => {
      let g = map.get(key);
      if (!g) {
        g = { key, label, revenueKrw: 0, settlementKrw: 0, unpriced: 0 };
        map.set(key, g);
      } else if (g.label.startsWith("미지정") && !label.startsWith("미지정")) {
        g.label = label; // 한쪽이 스냅샷 라벨을 갖고 있으면 채택
      }
      return g;
    };
    for (const r of inRev) {
      const { key, label } = revKeyOf(r);
      ensure(key, label).revenueKrw += revenueNetKrw(r);
    }
    for (const s of inSet) {
      const { key, label } = setKeyOf(s);
      const g = ensure(key, label);
      g.settlementKrw += settlementKrw(s);
      if (s.pricePerSession == null || !s.currency) g.unpriced += 1;
    }
    const list = Array.from(map.values());
    list.sort((a, b) => {
      const pa = a.revenueKrw - a.settlementKrw;
      const pb = b.revenueKrw - b.settlementKrw;
      if (!sort) return pb - pa; // 기본: 매출이익 내림차순
      let cmp: number;
      if (sort.key === "name") cmp = a.label.localeCompare(b.label, "ko");
      else if (sort.key === "revenue") cmp = a.revenueKrw - b.revenueKrw;
      else if (sort.key === "settlement") cmp = a.settlementKrw - b.settlementKrw;
      else cmp = pa - pb;
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [inRev, inSet, grouping, sort, rates]);

  const groupColLabel = grouping.replace("별", "");

  return (
    <div>
      <h1 className="text-ink text-2xl font-extrabold">매출이익</h1>
      <p className="text-muted-fg mt-1 text-sm">
        매출이익 = 매출(순매출) − 정산(강사 지급 예정액). 매출은 결제일, 정산은 수업 진행일 기준이라 기간 이익은 운영 참고용이며 실패·테스트 결제는 제외됩니다.
      </p>

      {/* 기간 토글 */}
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-muted-fg-faint text-xs font-semibold">기간</span>
          <div className="flex gap-1.5">
            {PERIODS.map((p) => (
              <ToggleChip key={p} active={period === p} onClick={() => setPeriod(p)} label={p} />
            ))}
          </div>
        </div>
        {hasTest && (
          <label className="text-muted-fg ml-auto inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium">
            <input type="checkbox" checked={includeTest} onChange={(e) => setIncludeTest(e.target.checked)} className="accent-accent-blue size-3.5" />
            테스트 데이터 포함
          </label>
        )}
      </div>

      {/* 기간 이동 */}
      <div className="border-rule mt-4 flex flex-wrap items-center gap-3 rounded-xl border bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => setAnchor((a) => shiftAnchor(a, period, -1))}
          className="border-rule text-muted-fg hover:text-ink hover:border-accent-blue inline-flex size-8 items-center justify-center rounded-md border transition-colors"
          aria-label="이전 기간"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <span className="text-ink min-w-[9rem] text-center text-sm font-bold whitespace-nowrap">{periodLabel(anchor, period)}</span>
        <button
          type="button"
          onClick={() => setAnchor((a) => shiftAnchor(a, period, 1))}
          className="border-rule text-muted-fg hover:text-ink hover:border-accent-blue inline-flex size-8 items-center justify-center rounded-md border transition-colors"
          aria-label="다음 기간"
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => setAnchor(todayKst())}
          className="border-rule text-muted-fg hover:text-ink rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
        >
          오늘
        </button>
      </div>

      {/* KPI 카드 */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="매출" value={formatPrice(kpi.revenue, "KRW")} hint="순매출(환불 차감)" />
        <KpiCard label="정산" value={formatPrice(kpi.settlement, "KRW")} hint="강사 지급 예정액" tone="settlement" />
        <KpiCard label="매출이익" value={formatPrice(kpi.profit, "KRW")} hint="매출 − 정산" tone={kpi.profit >= 0 ? "profit" : "loss"} />
        <KpiCard label="이익률" value={kpi.margin == null ? "—" : `${kpi.margin.toFixed(1)}%`} hint="매출이익 ÷ 매출" tone={kpi.margin == null ? undefined : kpi.margin >= 0 ? "profit" : "loss"} />
      </div>

      {kpi.unpriced > 0 && (
        <p className="bg-brand/5 border-brand/30 text-brand mt-3 rounded-lg border px-3 py-2 text-xs">
          단가 미설정 {kpi.unpriced}건 — 정산 단가가 없는 진행 수업입니다. 원가 0으로 계산되어 매출이익이 실제보다 커 보일 수 있습니다.
        </p>
      )}

      {/* 추이 차트(매출 vs 정산) */}
      <ProfitTrendChart data={trend} title={period === "년간" ? "년도별 매출·정산" : "월별 매출·정산"} />

      {/* 분류별 매출이익 */}
      <div className="mt-6 flex items-center gap-2">
        <span className="text-muted-fg-faint text-xs font-semibold">분류</span>
        <div className="flex gap-1.5">
          {GROUPINGS.map((g) => (
            <ToggleChip key={g} active={grouping === g} onClick={() => setGrouping(g)} label={g} />
          ))}
        </div>
      </div>
      <div className="border-rule mt-3 overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-rule bg-surface text-muted-fg-faint border-b text-left text-xs font-semibold">
              <SortHeader label={groupColLabel} sortKey="name" sort={sort} onSort={toggleSort} className="px-4 py-2.5 md:px-6" />
              <SortHeader label="매출" sortKey="revenue" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
              <SortHeader label="정산" sortKey="settlement" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
              <SortHeader label="매출이익" sortKey="profit" sort={sort} onSort={toggleSort} className="px-4 py-2.5 md:px-6" />
              <th className="px-4 py-2.5">이익률</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-muted-fg px-6 py-12 text-center text-sm">
                  이 기간에 매출·정산 내역이 없습니다.
                </td>
              </tr>
            ) : (
              groups.map((g) => {
                const profit = g.revenueKrw - g.settlementKrw;
                const margin = g.revenueKrw > 0 ? (profit / g.revenueKrw) * 100 : null;
                return (
                  <tr key={g.key} className="border-rule border-b last:border-b-0">
                    <td className="text-ink px-4 py-3 align-middle font-semibold md:px-6">
                      {g.label}
                      {g.unpriced > 0 && <span className="text-brand ml-1.5 text-xs font-medium">단가 미설정 {g.unpriced}</span>}
                    </td>
                    <td className="text-ink px-4 py-3 align-middle whitespace-nowrap">{formatPrice(g.revenueKrw, "KRW")}</td>
                    <td className="text-muted-fg px-4 py-3 align-middle whitespace-nowrap">{formatPrice(g.settlementKrw, "KRW")}</td>
                    <td className={cn("px-4 py-3 align-middle font-semibold whitespace-nowrap md:px-6", profit >= 0 ? "text-accent-blue-ink" : "text-brand")}>
                      {formatPrice(profit, "KRW")}
                    </td>
                    <td className="text-muted-fg px-4 py-3 align-middle whitespace-nowrap">{margin == null ? "—" : `${margin.toFixed(1)}%`}</td>
                  </tr>
                );
              })
            )}
          </tbody>
          {groups.length > 0 && (
            <tfoot>
              <tr className="border-rule bg-surface border-t-2 font-bold">
                <td className="text-ink px-4 py-3 align-middle md:px-6">합계</td>
                <td className="text-ink px-4 py-3 align-middle whitespace-nowrap">{formatPrice(kpi.revenue, "KRW")}</td>
                <td className="text-ink px-4 py-3 align-middle whitespace-nowrap">{formatPrice(kpi.settlement, "KRW")}</td>
                <td className={cn("px-4 py-3 align-middle whitespace-nowrap md:px-6", kpi.profit >= 0 ? "text-accent-blue-ink" : "text-brand")}>{formatPrice(kpi.profit, "KRW")}</td>
                <td className="text-ink px-4 py-3 align-middle whitespace-nowrap">{kpi.margin == null ? "—" : `${kpi.margin.toFixed(1)}%`}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function tooltipOf(label: string, revenue: number, settlement: number): string {
  return `${label} · 매출 ${formatPrice(revenue, "KRW")} · 정산 ${formatPrice(settlement, "KRW")} · 이익 ${formatPrice(revenue - settlement, "KRW")}`;
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

// 매출·정산 그룹 세로 막대(2계열) — 버킷마다 매출(파랑)·정산(앰버) 두 막대. baseline 앵커·per-bucket hover.
function ProfitTrendChart({ data, title }: { data: TrendBucket[]; title: string }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.revenue, d.settlement)));
  const showLabelEvery = data.length > 15 ? 5 : data.length > 7 ? 2 : 1;
  const fill = data.length >= 5;
  const colClass = fill ? "flex-1 min-w-[8px]" : "w-16";
  return (
    <div className="border-rule mt-4 rounded-xl border bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-ink text-sm font-bold">{title}</p>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-muted-fg inline-flex items-center gap-1.5">
            <span className="bg-accent-blue size-2.5 rounded-sm" /> 매출
          </span>
          <span className="text-muted-fg inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-[#F5A623]" /> 정산
          </span>
        </div>
      </div>
      <div className="mt-4 flex items-end justify-center gap-[3px]" style={{ height: 160 }}>
        {data.map((d) => (
          <div key={d.key} className={cn("group relative flex items-end justify-center gap-[2px]", colClass)}>
            <div
              className={cn("flex-1 rounded-t-[3px] transition-colors", d.highlight ? "bg-accent-blue-ink" : "bg-accent-blue group-hover:bg-accent-blue-ink")}
              style={{ height: Math.max(d.revenue > 0 ? 3 : 1, Math.round((d.revenue / max) * 140)) }}
            />
            <div
              className="flex-1 rounded-t-[3px] bg-[#F5A623] transition-colors group-hover:bg-[#d98c12]"
              style={{ height: Math.max(d.settlement > 0 ? 3 : 1, Math.round((d.settlement / max) * 140)) }}
            />
            {/* 툴팁 */}
            <div className="bg-ink pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-md px-2 py-1 text-[11px] whitespace-nowrap text-white group-hover:block">
              {d.tooltip}
            </div>
          </div>
        ))}
      </div>
      {/* x축 라벨 */}
      <div className="mt-1.5 flex justify-center gap-[3px]">
        {data.map((d, i) => (
          <div
            key={d.key}
            className={cn("text-muted-fg-faint text-center text-[10px]", colClass)}
          >
            {i % showLabelEvery === 0 ? d.xLabel : ""}
          </div>
        ))}
      </div>
    </div>
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

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" } | null;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort?.key === sortKey;
  const Icon = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th className={className} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(sortKey)} className="hover:text-ink inline-flex items-center gap-1 font-semibold transition-colors">
        {label}
        <Icon aria-hidden className={cn("size-3.5", active ? "text-ink" : "text-muted-fg-faint/60")} />
      </button>
    </th>
  );
}
