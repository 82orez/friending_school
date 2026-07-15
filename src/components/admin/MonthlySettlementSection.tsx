"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPrice, type Rates } from "@/data/currencies";
import type { SettlementRow } from "@/components/admin/SettlementsManager";
import SettlementFinalizeModal from "@/components/admin/SettlementFinalizeModal";

// 월간 정산 확정 원장(center_settlements) — page가 centerId|YYYY-MM 키로 전달.
export type SettlementAdjustment = { label: string; amount: number; currency: string; krw: number };
export type CenterSettlementRecord = {
  id: string;
  centerId: string;
  periodMonth: string; // 'YYYY-MM'
  sessionsCount: number;
  currency: string | null;
  baseAmount: number | null;
  baseKrw: number;
  baseNative: Record<string, number>;
  adjustments: SettlementAdjustment[];
  totalKrw: number;
  status: "확정" | "지급완료";
  note: string | null;
  paidAt: string | null;
  confirmedAt: string;
};
// 확정 전 라이브 base(그 센터·월 rows에서 파생).
export type LiveBase = { sessionsCount: number; baseNative: Record<string, number>; baseKrw: number; currency: string | null };

// ── TZ 비종속 월 헬퍼 ──
const todayKst = (): string => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
const thisMonth = (): string => todayKst().slice(0, 7);
const shiftMonth = (ym: string, delta: number): string => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 10).slice(0, 7);
};
const monthBounds = (ym: string): { start: string; end: string } => {
  const [y, m] = ym.split("-").map(Number);
  return { start: `${ym}-01`, end: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
};
const monthLabel = (ym: string): string => {
  const [y, m] = ym.split("-");
  return `${y}년 ${Number(m)}월`;
};

type Center = { id: string; name: string; currency: string };
type CenterRow = { id: string; name: string; base: LiveBase; record?: CenterSettlementRecord };

export default function MonthlySettlementSection({
  centers,
  rows,
  rates,
  records,
  allowEarly = false,
}: {
  centers: Center[];
  rows: SettlementRow[];
  rates: Rates;
  records: Record<string, CenterSettlementRecord>;
  allowEarly?: boolean; // 테스트용: 마감 전(당월) 확정 허용(서버 env 기반)
}) {
  const [anchorMonth, setAnchorMonth] = useState<string>(() => thisMonth()); // 기본 = 이번 달
  const [finalizeCenter, setFinalizeCenter] = useState<{ id: string; name: string } | null>(null);

  const { start, end } = monthBounds(anchorMonth);
  const rawClosed = end < todayKst(); // 실제 마감 여부
  // 유효 게이트 — 마감월이거나 테스트 플래그면 확정 가능.
  const monthClosed = rawClosed || allowEarly;

  // 그 달 rows를 센터별로 집계 → 센터 목록(미지정 센터 제외).
  const centerRows = useMemo<CenterRow[]>(() => {
    const byCenter = new Map<string, LiveBase>();
    for (const r of rows) {
      if (!r.centerId || r.sessionDate < start || r.sessionDate > end) continue;
      let b = byCenter.get(r.centerId);
      if (!b) {
        b = { sessionsCount: 0, baseNative: {}, baseKrw: 0, currency: null };
        byCenter.set(r.centerId, b);
      }
      b.sessionsCount += 1;
      if (r.pricePerSession != null && r.currency) {
        b.baseNative[r.currency] = (b.baseNative[r.currency] ?? 0) + r.pricePerSession;
        b.baseKrw += r.krwPerSession ?? 0;
      }
    }
    for (const b of Array.from(byCenter.values())) {
      b.baseKrw = Math.round(b.baseKrw);
      b.currency = Object.keys(b.baseNative).sort((a, c) => (b.baseNative[c] ?? 0) - (b.baseNative[a] ?? 0))[0] ?? null;
    }
    const nameById = new Map(centers.map((c) => [c.id, c.name]));
    const ids = new Set<string>([...Array.from(byCenter.keys())]);
    // 수업이 없어도 확정 레코드가 있으면 노출.
    for (const key of Object.keys(records)) {
      const [cid, ym] = key.split("|");
      if (ym === anchorMonth) ids.add(cid);
    }
    const list: CenterRow[] = [];
    for (const id of Array.from(ids)) {
      const base = byCenter.get(id) ?? { sessionsCount: 0, baseNative: {}, baseKrw: 0, currency: null };
      list.push({ id, name: nameById.get(id) ?? "센터", base, record: records[`${id}|${anchorMonth}`] });
    }
    list.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    return list;
  }, [rows, start, end, centers, records, anchorMonth]);

  const totalKrw = centerRows.reduce((s, r) => s + (r.record ? r.record.totalKrw : r.base.baseKrw), 0);

  const activeRow = finalizeCenter ? centerRows.find((r) => r.id === finalizeCenter.id) : null;

  return (
    <div className="mt-10">
      <h2 className="text-ink text-xl font-extrabold">월 정산금액 확정</h2>
      <p className="text-muted-fg mt-1 text-sm">
        센터별로 월 정산액을 확정하고(각 센터가 선 정산받아 소속 강사에게 지급), 송금 수수료 등 조정 항목을 더한 실지급액을 기록합니다. 마감된 지난 달만 확정할 수
        있습니다.
      </p>

      {/* 월 네비게이터 */}
      <div className="border-rule mt-4 flex flex-wrap items-center gap-3 rounded-xl border bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => setAnchorMonth((a) => shiftMonth(a, -1))}
          className="border-rule text-muted-fg hover:text-ink hover:border-accent-blue inline-flex size-8 items-center justify-center rounded-md border transition-colors"
          aria-label="이전 달"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <span className="text-ink min-w-[7rem] text-center text-sm font-bold whitespace-nowrap">{monthLabel(anchorMonth)}</span>
        <button
          type="button"
          onClick={() => setAnchorMonth((a) => shiftMonth(a, 1))}
          className="border-rule text-muted-fg hover:text-ink hover:border-accent-blue inline-flex size-8 items-center justify-center rounded-md border transition-colors"
          aria-label="다음 달"
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => setAnchorMonth(thisMonth())}
          className="border-rule text-muted-fg hover:text-ink rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
        >
          이번 달
        </button>
        {!rawClosed &&
          (allowEarly ? (
            <span className="text-accent-blue-ink ml-auto text-xs font-medium">테스트 모드: 마감 전이지만 확정 가능</span>
          ) : (
            <span className="text-brand ml-auto text-xs font-medium">아직 마감 전인 달입니다(확정 불가).</span>
          ))}
      </div>

      {/* 센터별 목록 */}
      <div className="border-rule mt-4 overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-rule bg-surface text-muted-fg-faint border-b text-left text-xs font-semibold">
              <th className="px-4 py-2.5 md:px-6">센터</th>
              <th className="px-4 py-2.5">진행 수업</th>
              <th className="px-4 py-2.5">기본 정산액</th>
              <th className="px-4 py-2.5 md:px-6">정산 상태</th>
            </tr>
          </thead>
          <tbody>
            {centerRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-muted-fg px-6 py-12 text-center text-sm">
                  이 달에 진행된 수업이 없습니다.
                </td>
              </tr>
            ) : (
              centerRows.map((c) => {
                const rec = c.record;
                const baseEntries = Object.entries(c.base.baseNative).filter(([, v]) => v > 0);
                return (
                  <tr key={c.id} className="border-rule border-b last:border-b-0">
                    <td className="text-ink px-4 py-3.5 align-middle font-semibold md:px-6">{c.name}</td>
                    <td className="text-ink px-4 py-3.5 align-middle whitespace-nowrap">
                      {c.base.sessionsCount}
                      <span className="text-muted-fg-faint">회</span>
                    </td>
                    <td className="text-ink px-4 py-3.5 align-middle whitespace-nowrap">
                      {baseEntries.length > 0 ? baseEntries.map(([cur, amt]) => formatPrice(amt, cur)).join(" + ") : "—"}
                      <span className="text-muted-fg-faint ml-1.5">≈ {formatPrice(c.base.baseKrw, "KRW")}</span>
                    </td>
                    <td className="px-4 py-3.5 align-middle md:px-6">
                      <button
                        type="button"
                        onClick={() => setFinalizeCenter({ id: c.id, name: c.name })}
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-semibold transition-colors",
                          rec?.status === "지급완료"
                            ? "bg-[#E6F4EA] text-[#1E7E34]"
                            : rec?.status === "확정"
                              ? "bg-accent-blue-soft text-accent-blue-ink"
                              : "border-rule text-muted-fg hover:border-accent-blue hover:text-accent-blue-ink border bg-white",
                        )}
                      >
                        {rec?.status ?? "미확정"}
                        {rec && <span className="ml-1 font-bold">{formatPrice(rec.totalKrw, "KRW")}</span>}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {centerRows.length > 0 && (
            <tfoot>
              <tr className="border-rule bg-surface border-t-2 font-bold">
                <td className="text-ink px-4 py-3 align-middle md:px-6">합계</td>
                <td />
                <td />
                <td className="text-ink px-4 py-3 align-middle whitespace-nowrap md:px-6">≈ {formatPrice(totalKrw, "KRW")}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {finalizeCenter && activeRow && (
        <SettlementFinalizeModal
          center={finalizeCenter}
          periodMonth={anchorMonth}
          monthLabel={monthLabel(anchorMonth)}
          monthClosed={monthClosed}
          record={activeRow.record ?? null}
          liveBase={activeRow.base}
          rates={rates}
          onClose={() => setFinalizeCenter(null)}
        />
      )}
    </div>
  );
}
