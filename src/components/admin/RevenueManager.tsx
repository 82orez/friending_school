"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, ExternalLink, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPrice, type Rates } from "@/data/currencies";
import { vatBreakdown } from "@/lib/vat";
import { pgFeeOf } from "@/lib/pgfee";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// 서버 page가 payments+enrollment 스냅샷을 결제 1건씩 전달(failed·테스트 결제는 이미 제외).
export type RevenueRow = {
  paymentId: string;
  createdAt: string;
  kstDate: string; // 'YYYY-MM-DD' (KST) — 기간 필터·집계 기준
  amount: number;
  cancelledAmount: number;
  krwAmount: number; // amount를 결제일(kstDate) 기준 환율로 원화 환산(로더 계산). KRW=그대로.
  krwCancelledAmount: number; // cancelledAmount의 원화 환산
  krwSupply: number; // krwAmount의 공급가액(부가세 제외) — 로더에서 행별 역산
  krwVat: number; // krwAmount의 부가세(10%)
  krwCancelledSupply: number; // krwCancelledAmount의 공급가액
  krwCancelledVat: number; // krwCancelledAmount의 부가세
  pgFeeRate: number; // 결제일 기준 적용 PG 수수료율(%). 0=미설정·무통장 입금
  krwPgFee: number; // 순결제액(krwAmount − krwCancelledAmount) × pgFeeRate, 로더에서 행별 반올림
  status: string; // paid | cancelled | partial_cancelled
  method: string | null;
  currency: string;
  course: string | null;
  courseTitle: string | null;
  studentName: string | null;
  studentEnglishName: string | null;
  teacherId: string | null;
  teacherName: string | null;
  centerId: string | null;
  centerName: string | null;
  receiptUrl: string | null;
  note: string | null;
  enrollmentId: string | null;
  isTest: boolean;
};

// ── TZ 비종속 날짜 헬퍼(server-only 헬퍼 재사용 불가 → 인라인, SettlementsManager와 동일) ──
const weekdayOf = (d: string): number => {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).getUTCDay();
};
const addDaysStr = (d: string, days: number): string => {
  const [y, m, day] = d.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, day));
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
};
const todayKst = (): string => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
const mondayOf = (d: string): string => addDaysStr(d, -((weekdayOf(d) + 6) % 7)); // 주 시작 = 월요일
const monthStart = (d: string): string => `${d.slice(0, 7)}-01`;
const monthEnd = (d: string): string => {
  const [y, m] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
const shiftMonth = (d: string, delta: number): string => {
  const [y, m] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 10);
};
const DOW_KO = ["일", "월", "화", "수", "목", "금", "토"];

type Period = "주간" | "월간" | "년간";
const PERIODS: Period[] = ["주간", "월간", "년간"];
type Grouping = "과정별" | "센터별" | "결제수단별" | "학생별";
const GROUPINGS: Grouping[] = ["과정별", "센터별", "결제수단별", "학생별"];
type SortKey = "name" | "count" | "amount";
type StatusFilter = "전체" | "결제완료" | "부분환불" | "환불";
const STATUS_FILTERS: StatusFilter[] = ["전체", "결제완료", "부분환불", "환불"];

function interval(anchor: string, period: Period): { start: string; end: string } {
  if (period === "주간") {
    const s = mondayOf(anchor);
    return { start: s, end: addDaysStr(s, 6) };
  }
  if (period === "년간") return { start: `${anchor.slice(0, 4)}-01-01`, end: `${anchor.slice(0, 4)}-12-31` };
  return { start: monthStart(anchor), end: monthEnd(anchor) };
}
function periodLabel(anchor: string, period: Period): string {
  if (period === "주간") {
    const { start, end } = interval(anchor, "주간");
    return `${start} ~ ${end}`;
  }
  if (period === "년간") return `${anchor.slice(0, 4)}년`;
  const [y, m] = anchor.split("-");
  return `${y}년 ${Number(m)}월`;
}
function shiftAnchor(anchor: string, period: Period, delta: number): string {
  if (period === "주간") return addDaysStr(anchor, delta * 7);
  if (period === "년간") return shiftMonth(anchor, delta * 12);
  return shiftMonth(anchor, delta);
}

// 결제 수단 라벨. PortOne V2는 카드를 method.type="PaymentMethodCard"로 저장하므로 "card"뿐 아니라 Card 포함 문자열도 카드로 인식.
function payMethodLabel(method: string | null): string {
  if (!method) return "기타";
  if (method === "bank_transfer") return "무통장 입금";
  const m = method.toLowerCase();
  if (m.includes("card")) return "카드";
  if (m.includes("transfer") || m.includes("bank")) return "계좌이체";
  if (m.includes("virtualaccount")) return "가상계좌";
  if (m.includes("easypay")) return "간편결제";
  return method;
}

// 원화 환산은 로더가 결제일 환율로 사전 계산(r.krwAmount/r.krwCancelledAmount) → 여기선 합산만.
// 순공급가액 = grossSupplyKrw − refundSupplyKrw, 순부가세 = grossVatKrw − refundVatKrw (표시 시 파생).
type Group = {
  key: string;
  label: string;
  count: number;
  grossKrw: number;
  refundKrw: number;
  netKrw: number;
  netSupplyKrw: number;
  netVatKrw: number;
  pgFeeKrw: number;
};
type TrendBucket = { key: string; net: number; tooltip: string; xLabel: string; highlight?: boolean; dow?: number };

function aggregate(rows: RevenueRow[], keyOf: (r: RevenueRow) => { key: string; label: string }): Group[] {
  const map = new Map<string, Group>();
  for (const r of rows) {
    const { key, label } = keyOf(r);
    let g = map.get(key);
    if (!g) {
      g = { key, label, count: 0, grossKrw: 0, refundKrw: 0, netKrw: 0, netSupplyKrw: 0, netVatKrw: 0, pgFeeKrw: 0 };
      map.set(key, g);
    }
    g.count += 1;
    g.grossKrw += r.krwAmount;
    g.refundKrw += r.krwCancelledAmount;
    g.netKrw += r.krwAmount - r.krwCancelledAmount;
    g.netSupplyKrw += r.krwSupply - r.krwCancelledSupply;
    g.netVatKrw += r.krwVat - r.krwCancelledVat;
    g.pgFeeKrw += r.krwPgFee;
  }
  return Array.from(map.values());
}

export default function RevenueManager({ rows, rates }: { rows: RevenueRow[]; rates: Rates }) {
  const [period, setPeriod] = useState<Period>("월간");
  const [anchor, setAnchor] = useState<string>(() => todayKst());
  const [grouping, setGrouping] = useState<Grouping>("과정별");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const [txQuery, setTxQuery] = useState("");
  const [txStatus, setTxStatus] = useState<StatusFilter>("전체");
  const [includeTest, setIncludeTest] = useState(false);
  const [csvConfirmOpen, setCsvConfirmOpen] = useState(false);

  const hasTest = useMemo(() => rows.some((r) => r.isTest), [rows]);
  const toggleSort = (key: SortKey) =>
    setSort((prev) => (prev?.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const { start, end } = useMemo(() => interval(anchor, period), [anchor, period]);
  // 테스트 결제(is_test)는 기본 제외(운영 정확도), 토글 시 포함.
  const baseRows = useMemo(() => (includeTest ? rows : rows.filter((r) => !r.isTest)), [rows, includeTest]);
  const inRangeRows = useMemo(() => baseRows.filter((r) => r.kstDate >= start && r.kstDate <= end), [baseRows, start, end]);

  // KPI(기간 내).
  const kpi = useMemo(() => {
    let gross = 0;
    let refund = 0;
    let netSupply = 0; // 순공급가액(부가세 제외)
    let netVat = 0; // 순부가세
    let pgFee = 0; // PG 수수료(순결제액 기준)
    let refundCount = 0;
    for (const r of inRangeRows) {
      gross += r.krwAmount;
      refund += r.krwCancelledAmount;
      netSupply += r.krwSupply - r.krwCancelledSupply;
      netVat += r.krwVat - r.krwCancelledVat;
      pgFee += r.krwPgFee;
      if (r.cancelledAmount > 0) refundCount += 1;
    }
    return { gross, refund, net: gross - refund, netSupply, netVat, pgFee, count: inRangeRows.length, refundCount };
  }, [inRangeRows]);

  // 추이 차트 버킷 — 주간=일별(7개), 월간·년간=앵커 연도의 월별 12개(월간은 선택 월 강조).
  const trend = useMemo<TrendBucket[]>(() => {
    const netOf = (r: RevenueRow) => r.krwAmount - r.krwCancelledAmount;
    if (period === "주간") {
      const byDate = new Map<string, number>();
      for (const r of inRangeRows) byDate.set(r.kstDate, (byDate.get(r.kstDate) ?? 0) + netOf(r));
      const days: TrendBucket[] = [];
      for (let d = start; d <= end; d = addDaysStr(d, 1)) {
        const net = byDate.get(d) ?? 0;
        const dow = weekdayOf(d);
        days.push({
          key: d,
          net,
          tooltip: `${d} (${DOW_KO[dow]}) · ${formatPrice(net, "KRW")}`,
          xLabel: `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}일(${DOW_KO[dow]})`,
          dow,
        });
      }
      return days;
    }
    if (period === "년간") {
      // 데이터가 있는 연도 범위(앵커 연도 포함) 전체의 연도별 순매출, 선택 연도 강조.
      const byYear = new Map<number, number>();
      for (const r of baseRows) byYear.set(Number(r.kstDate.slice(0, 4)), (byYear.get(Number(r.kstDate.slice(0, 4))) ?? 0) + netOf(r));
      const anchorY = Number(anchor.slice(0, 4));
      let minY = anchorY;
      let maxY = anchorY;
      for (const yr of Array.from(byYear.keys())) {
        if (yr < minY) minY = yr;
        if (yr > maxY) maxY = yr;
      }
      const out: TrendBucket[] = [];
      for (let yr = minY; yr <= maxY; yr++) {
        const net = byYear.get(yr) ?? 0;
        out.push({ key: String(yr), net, tooltip: `${yr}년 · ${formatPrice(net, "KRW")}`, xLabel: `${yr}`, highlight: yr === anchorY });
      }
      return out;
    }
    // 월간: 앵커 연도 전체의 월별 순매출(KPI 기간과 별개로 연간 월별 추이를 보여주고 선택 월 강조).
    const y = anchor.slice(0, 4);
    const yearRows = baseRows.filter((r) => r.kstDate.slice(0, 4) === y);
    const byMonth = new Map<number, number>();
    for (const r of yearRows) byMonth.set(Number(r.kstDate.slice(5, 7)), (byMonth.get(Number(r.kstDate.slice(5, 7))) ?? 0) + netOf(r));
    const selMonth = period === "월간" ? Number(anchor.slice(5, 7)) : -1;
    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const net = byMonth.get(m) ?? 0;
      return { key: `${y}-${m}`, net, tooltip: `${y}년 ${m}월 · ${formatPrice(net, "KRW")}`, xLabel: `${m}월`, highlight: m === selMonth };
    });
  }, [inRangeRows, baseRows, start, end, rates, period, anchor]);

  // 분류별 집계.
  const groups = useMemo(() => {
    const keyOf = (r: RevenueRow): { key: string; label: string } => {
      if (grouping === "과정별") return { key: r.course ?? "__none__", label: r.courseTitle ?? "미지정 과정" };
      if (grouping === "센터별") return { key: r.centerId ?? "__none__", label: r.centerName ?? "미지정 센터" };
      if (grouping === "결제수단별") return { key: r.method ?? "__none__", label: payMethodLabel(r.method) };
      const label = r.studentEnglishName ? `${r.studentName ?? "-"} (${r.studentEnglishName})` : (r.studentName ?? "-");
      return { key: `${r.studentName ?? "-"}|${r.studentEnglishName ?? ""}`, label };
    };
    const list = aggregate(inRangeRows, keyOf);
    list.sort((a, b) => {
      if (!sort) return b.netKrw - a.netKrw; // 기본: 순매출 내림차순
      let cmp: number;
      if (sort.key === "name") cmp = a.label.localeCompare(b.label, "ko");
      else if (sort.key === "count") cmp = a.count - b.count;
      else cmp = a.netKrw - b.netKrw;
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [inRangeRows, grouping, sort, rates]);

  // 트랜잭션 목록(검색·상태 필터).
  const txRows = useMemo(() => {
    const q = txQuery.trim().toLowerCase();
    return inRangeRows.filter((r) => {
      if (txStatus !== "전체") {
        if (txStatus === "결제완료" && r.status !== "paid") return false;
        if (txStatus === "부분환불" && r.status !== "partial_cancelled") return false;
        if (txStatus === "환불" && r.status !== "cancelled") return false;
      }
      if (!q) return true;
      return [r.studentName, r.studentEnglishName, r.courseTitle].some((v) => (v ?? "").toLowerCase().includes(q));
    });
  }, [inRangeRows, txQuery, txStatus]);

  const exportCsv = () => {
    const header = [
      "결제일",
      "학생",
      "영문명",
      "과정",
      "결제수단",
      "통화",
      "결제금액",
      "환불금액",
      "순액",
      "공급가액",
      "부가세",
      "PG수수료",
      "상태",
      "메모",
      "결제ID",
    ];
    const body = txRows.map((r) => {
      const net = r.amount - r.cancelledAmount;
      const { supply, vat } = vatBreakdown(net);
      const fee = pgFeeOf(net, r.pgFeeRate);
      return [
        r.kstDate,
        r.studentName ?? "",
        r.studentEnglishName ?? "",
        r.courseTitle ?? "",
        payMethodLabel(r.method),
        r.currency,
        String(r.amount),
        String(r.cancelledAmount),
        String(net),
        String(supply),
        String(vat),
        String(fee),
        statusLabel(r.status),
        r.note ?? "",
        r.paymentId,
      ];
    });
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [header, ...body].map((row) => row.map(escape).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }); // BOM=엑셀 한글 대응
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `revenue_${start}_${end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <h1 className="text-ink text-2xl font-extrabold">매출 현황</h1>
      <p className="text-muted-fg mt-1 text-sm">
        카드·무통장 결제 기준 매출입니다. 순매출 = 결제금액 − 환불금액 = 공급가액 + 부가세(부가세 10% 포함가 기준)이며, 실패·테스트 결제는 제외됩니다.
        PG 수수료는 순결제액 × 결제일 기준 수수료율(무통장 입금 제외)로, 매출이익에서 차감됩니다.
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
            테스트 결제 포함
          </label>
        )}
      </div>

      {/* 기간 이동 */}
      <div className="border-rule mt-4 flex flex-wrap items-center gap-3 rounded-xl border bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => setAnchor((a) => shiftAnchor(a, period, -1))}
          className="border-rule text-muted-fg hover:text-ink hover:border-accent-blue inline-flex size-8 items-center justify-center rounded-md border transition-colors"
          aria-label="이전 기간">
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <span className="text-ink min-w-[9rem] text-center text-sm font-bold whitespace-nowrap">{periodLabel(anchor, period)}</span>
        <button
          type="button"
          onClick={() => setAnchor((a) => shiftAnchor(a, period, 1))}
          className="border-rule text-muted-fg hover:text-ink hover:border-accent-blue inline-flex size-8 items-center justify-center rounded-md border transition-colors"
          aria-label="다음 기간">
          <ChevronRight className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => setAnchor(todayKst())}
          className="border-rule text-muted-fg hover:text-ink rounded-md border px-3 py-1.5 text-xs font-medium transition-colors">
          오늘
        </button>
        <span className="text-muted-fg-faint ml-auto text-xs">주 시작: 월요일</span>
      </div>

      {/* KPI 카드 — 순매출 = 공급가액 + 부가세(부가세 10% 포함가 역산) */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <KpiCard label="총매출" value={formatPrice(kpi.gross, "KRW")} hint="환불 전 결제 합계" />
        <KpiCard label="환불" value={formatPrice(kpi.refund, "KRW")} hint={`환불 ${kpi.refundCount}건`} tone="refund" />
        <KpiCard label="순매출" value={formatPrice(kpi.net, "KRW")} hint="총매출 − 환불" tone="net" />
        <KpiCard label="공급가액" value={formatPrice(kpi.netSupply, "KRW")} hint="순매출 ÷ 1.1 (부가세 제외)" />
        <KpiCard label="부가세" value={formatPrice(kpi.netVat, "KRW")} hint="순매출 − 공급가액 (10%)" />
        <KpiCard label="PG 수수료" value={formatPrice(kpi.pgFee, "KRW")} hint="순결제액 × 수수료율 (무통장 제외)" tone="refund" />
        <KpiCard label="결제 건수" value={String(kpi.count)} hint="기간 내 결제" />
      </div>

      {/* 추이 차트 */}
      <RevenueTrendChart data={trend} title={period === "주간" ? "일자별 순매출" : period === "년간" ? "년도별 순매출" : "월별 순매출"} />

      {/* 분류별 집계 */}
      <div className="mt-6 flex items-center gap-2">
        <span className="text-muted-fg-faint text-xs font-semibold">분류</span>
        <div className="flex gap-1.5">
          {GROUPINGS.map((g) => (
            <ToggleChip key={g} active={grouping === g} onClick={() => setGrouping(g)} label={g} />
          ))}
        </div>
      </div>
      <div className="border-rule mt-3 overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-rule bg-surface text-muted-fg-faint border-b text-left text-xs font-semibold">
              <SortHeader label={grouping.replace("별", "")} sortKey="name" sort={sort} onSort={toggleSort} className="px-4 py-2.5 md:px-6" />
              <SortHeader label="건수" sortKey="count" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
              <th className="px-4 py-2.5">환불</th>
              <th className="px-4 py-2.5">공급가액</th>
              <th className="px-4 py-2.5">부가세</th>
              <th className="px-4 py-2.5">PG 수수료</th>
              <SortHeader label="순매출" sortKey="amount" sort={sort} onSort={toggleSort} className="px-4 py-2.5 md:px-6" />
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-muted-fg px-6 py-12 text-center text-sm">
                  이 기간에 결제 내역이 없습니다.
                </td>
              </tr>
            ) : (
              groups.map((g) => (
                <tr key={g.key} className="border-rule border-b last:border-b-0">
                  <td className="text-ink px-4 py-3 font-medium break-words md:px-6">{g.label}</td>
                  <td className="text-muted-fg px-4 py-3 whitespace-nowrap">{g.count}건</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {g.refundKrw > 0 ? (
                      <span className="text-[#B45309]">{formatPrice(g.refundKrw, "KRW")}</span>
                    ) : (
                      <span className="text-muted-fg-faint">—</span>
                    )}
                  </td>
                  <td className="text-muted-fg px-4 py-3 whitespace-nowrap">{formatPrice(g.netSupplyKrw, "KRW")}</td>
                  <td className="text-muted-fg px-4 py-3 whitespace-nowrap">{formatPrice(g.netVatKrw, "KRW")}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {g.pgFeeKrw > 0 ? (
                      <span className="text-[#B45309]">{formatPrice(g.pgFeeKrw, "KRW")}</span>
                    ) : (
                      <span className="text-muted-fg-faint">—</span>
                    )}
                  </td>
                  <td className="text-ink px-4 py-3 font-bold whitespace-nowrap md:px-6">{formatPrice(g.netKrw, "KRW")}</td>
                </tr>
              ))
            )}
          </tbody>
          {groups.length > 0 && (
            <tfoot>
              <tr className="border-rule bg-surface border-t text-sm font-bold">
                <td className="px-4 py-3 md:px-6">합계</td>
                <td className="px-4 py-3 whitespace-nowrap">{kpi.count}건</td>
                <td className="px-4 py-3 whitespace-nowrap text-[#B45309]">{kpi.refund > 0 ? formatPrice(kpi.refund, "KRW") : "—"}</td>
                <td className="px-4 py-3 whitespace-nowrap">{formatPrice(kpi.netSupply, "KRW")}</td>
                <td className="px-4 py-3 whitespace-nowrap">{formatPrice(kpi.netVat, "KRW")}</td>
                <td className="px-4 py-3 whitespace-nowrap text-[#B45309]">{kpi.pgFee > 0 ? formatPrice(kpi.pgFee, "KRW") : "—"}</td>
                <td className="text-ink px-4 py-3 whitespace-nowrap md:px-6">{formatPrice(kpi.net, "KRW")}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* 트랜잭션 목록 */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-ink text-lg font-bold">결제 내역</h2>
        <button
          type="button"
          onClick={() => setCsvConfirmOpen(true)}
          disabled={txRows.length === 0}
          className="border-rule text-muted-fg hover:text-ink hover:border-accent-blue inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50">
          <Download className="size-4" aria-hidden />
          CSV 내보내기
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="flex gap-1.5">
          {STATUS_FILTERS.map((s) => (
            <ToggleChip key={s} active={txStatus === s} onClick={() => setTxStatus(s)} label={s} />
          ))}
        </div>
        <div className="border-rule ml-auto flex min-w-[12rem] flex-1 items-center gap-2 rounded-lg border bg-white px-3">
          <Search className="text-muted-fg-faint size-4" aria-hidden />
          <input
            type="text"
            value={txQuery}
            onChange={(e) => setTxQuery(e.target.value)}
            placeholder="학생·과정 검색..."
            className="h-10 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
      </div>
      <div className="border-rule mt-3 overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-rule bg-surface text-muted-fg-faint border-b text-left text-xs font-semibold">
              <th className="px-4 py-2.5 md:px-6">결제일</th>
              <th className="px-4 py-2.5">학생</th>
              <th className="px-4 py-2.5">과정</th>
              <th className="px-4 py-2.5">수단</th>
              <th className="px-4 py-2.5 text-right">결제금액</th>
              <th className="px-4 py-2.5 text-right">순액</th>
              <th className="px-4 py-2.5 text-right">공급가액</th>
              <th className="px-4 py-2.5 text-right">부가세</th>
              <th className="px-4 py-2.5 text-right">PG 수수료</th>
              <th className="px-4 py-2.5">상태</th>
              <th className="px-4 py-2.5 md:px-6">영수증</th>
            </tr>
          </thead>
          <tbody>
            {txRows.length === 0 ? (
              <tr>
                <td colSpan={11} className="text-muted-fg px-6 py-12 text-center text-sm">
                  결제 내역이 없습니다.
                </td>
              </tr>
            ) : (
              txRows.map((r) => {
                const net = r.amount - r.cancelledAmount;
                const { supply, vat } = vatBreakdown(net); // 원통화 순액 기준 부가세 역산
                const fee = pgFeeOf(net, r.pgFeeRate); // 원통화 순액 기준 PG 수수료(무통장=0)
                return (
                  <tr key={r.paymentId} className="border-rule border-b last:border-b-0">
                    <td className="text-muted-fg px-4 py-3 whitespace-nowrap md:px-6">{r.kstDate}</td>
                    <td className="text-ink px-4 py-3 break-words">
                      {r.studentName ?? "-"}
                      {r.studentEnglishName && <span className="text-muted-fg-faint ml-1 text-xs">({r.studentEnglishName})</span>}
                    </td>
                    <td className="text-muted-fg px-4 py-3 break-words">
                      {r.courseTitle ?? "-"}
                      {r.note && <span className="text-muted-fg-faint mt-0.5 block text-xs">📝 {r.note}</span>}
                    </td>
                    <td className="text-muted-fg px-4 py-3 whitespace-nowrap">{payMethodLabel(r.method)}</td>
                    <td className="text-ink px-4 py-3 text-right whitespace-nowrap">{formatPrice(r.amount, r.currency)}</td>
                    <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
                      {r.cancelledAmount > 0 ? (
                        <span className="text-[#B45309]">{formatPrice(net, r.currency)}</span>
                      ) : (
                        <span className="text-ink">{formatPrice(net, r.currency)}</span>
                      )}
                    </td>
                    <td className="text-muted-fg px-4 py-3 text-right whitespace-nowrap">{formatPrice(supply, r.currency)}</td>
                    <td className="text-muted-fg px-4 py-3 text-right whitespace-nowrap">{formatPrice(vat, r.currency)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {fee > 0 ? (
                        <span className="text-[#B45309]">{formatPrice(fee, r.currency)}</span>
                      ) : (
                        <span className="text-muted-fg-faint">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold", STATUS_BADGE[r.status] ?? "bg-rule text-muted-fg")}>
                        {statusLabel(r.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 md:px-6">
                      {r.receiptUrl ? (
                        <a
                          href={r.receiptUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-accent-blue-ink hover:text-accent-blue inline-flex items-center gap-1 font-semibold">
                          <ExternalLink className="size-3.5" aria-hidden />
                          보기
                        </a>
                      ) : (
                        <span className="text-muted-fg-faint">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <AlertDialog open={csvConfirmOpen} onOpenChange={setCsvConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>결제 내역을 CSV로 내보낼까요?</AlertDialogTitle>
            <AlertDialogDescription>
              현재 기간·필터 기준 <span className="text-ink font-semibold">{txRows.length}건</span>의 결제 내역이 CSV 파일로 다운로드됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                exportCsv();
                setCsvConfirmOpen(false);
              }}
              className="bg-cta hover:bg-cta/90 border-transparent text-white">
              내보내기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function statusLabel(status: string): string {
  if (status === "paid") return "결제완료";
  if (status === "partial_cancelled") return "부분환불";
  if (status === "cancelled") return "환불";
  return status;
}
const STATUS_BADGE: Record<string, string> = {
  paid: "bg-[#E6F4EA] text-[#1E7E34]",
  partial_cancelled: "bg-[#FFF4E5] text-[#B45309]",
  cancelled: "bg-[#FFF4E5] text-[#B45309]",
};

function KpiCard({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: "net" | "refund" }) {
  return (
    <div className="border-rule rounded-xl border bg-white p-5">
      <p className="text-muted-fg-faint text-xs font-semibold">{label}</p>
      <p className={cn("mt-1 text-2xl font-extrabold", tone === "refund" ? "text-[#B45309]" : tone === "net" ? "text-accent-blue-ink" : "text-ink")}>
        {value}
      </p>
      <p className="text-muted-fg-faint mt-0.5 text-xs">{hint}</p>
    </div>
  );
}

// 순매출 세로 막대(단일 시계열 — legend 없이 제목이 계열을 지칭). baseline 앵커·per-bar hover.
// 막대가 적으면(년간=몇 개) 고정폭·가운데 정렬로 전체폭 stretch 방지, 많으면(주간·월간) flex로 채움.
function RevenueTrendChart({ data, title }: { data: TrendBucket[]; title: string }) {
  const max = Math.max(1, ...data.map((d) => d.net));
  const showLabelEvery = data.length > 15 ? 5 : data.length > 7 ? 2 : 1; // x축 라벨 밀도
  const fill = data.length >= 5; // 5개 이상=폭 채움, 그 미만=고정폭 가운데
  const colClass = fill ? "flex-1 min-w-[4px]" : "w-16";
  return (
    <div className="border-rule mt-4 rounded-xl border bg-white p-5">
      <p className="text-ink text-sm font-bold">{title}</p>
      <div className="mt-4 flex items-end justify-center gap-[2px]" style={{ height: 160 }}>
        {data.map((d) => {
          const h = Math.round((d.net / max) * 140);
          return (
            <div key={d.key} className={cn("group relative flex flex-col items-center justify-end", colClass)}>
              <div
                className={cn(
                  "w-full rounded-t-[4px] transition-colors",
                  d.net > 0
                    ? d.highlight
                      ? "bg-accent-blue-ink"
                      : "bg-accent-blue group-hover:bg-accent-blue-ink"
                    : d.highlight
                      ? "bg-accent-blue/40"
                      : "bg-rule",
                )}
                style={{ height: Math.max(d.net > 0 ? 3 : 1, h) }}
              />
              {/* 툴팁 */}
              <div className="bg-ink pointer-events-none absolute bottom-full z-10 mb-1 hidden rounded-md px-2 py-1 text-[11px] whitespace-nowrap text-white group-hover:block">
                {d.tooltip}
              </div>
            </div>
          );
        })}
      </div>
      {/* x축 라벨 */}
      <div className="mt-1.5 flex justify-center gap-[2px]">
        {data.map((d, i) => (
          <div
            key={d.key}
            className={cn(
              "text-center text-[10px]",
              colClass,
              d.dow === 0 ? "text-brand" : d.dow === 6 ? "text-accent-blue-ink" : "text-muted-fg-faint",
            )}>
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
      )}>
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
