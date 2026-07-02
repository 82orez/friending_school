"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPrice, krwEquivalent } from "@/data/currencies";

// 서버 page가 conducted 수업 1건씩 enriched row로 전달(단가=강사 현재 소속 센터).
export type SettlementRow = {
  id: string;
  teacherId: string;
  teacherName: string;
  centerId: string | null;
  centerName: string | null;
  course: string;
  courseTitle: string;
  sessionDate: string; // 'YYYY-MM-DD' (KST)
  isMakeup: boolean;
  pricePerSession: number | null; // 센터 단가 미설정/센터 미지정 시 null
  currency: string | null; // pricePerSession 있을 때만
};

// ── TZ 비종속 날짜 헬퍼(makeup.ts/booking.ts는 server-only라 클라에서 재사용 불가 → 인라인) ──
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
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // 다음 달 0일 = 이번 달 말일
};
const shiftMonth = (d: string, delta: number): string => {
  const [y, m] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 10);
};
const DOW_KO = ["일", "월", "화", "수", "목", "금", "토"];

type Period = "일간" | "주간" | "월간";
const PERIODS: Period[] = ["일간", "주간", "월간"];
type Grouping = "센터별" | "강사별" | "과정별";
const GROUPINGS: Grouping[] = ["센터별", "강사별", "과정별"];

type SortKey = "name" | "count" | "amount";

type Group = {
  key: string;
  label: string;
  count: number;
  currencyTotals: Map<string, number>;
  unpriced: number;
  krwTotal: number;
};

function interval(anchor: string, period: Period): { start: string; end: string } {
  if (period === "일간") return { start: anchor, end: anchor };
  if (period === "주간") {
    const s = mondayOf(anchor);
    return { start: s, end: addDaysStr(s, 6) };
  }
  return { start: monthStart(anchor), end: monthEnd(anchor) };
}

function periodLabel(anchor: string, period: Period): string {
  if (period === "일간") return `${anchor} (${DOW_KO[weekdayOf(anchor)]})`;
  if (period === "주간") {
    const { start, end } = interval(anchor, "주간");
    return `${start} ~ ${end}`;
  }
  const [y, m] = anchor.split("-");
  return `${y}년 ${Number(m)}월`;
}

function shiftAnchor(anchor: string, period: Period, delta: number): string {
  if (period === "일간") return addDaysStr(anchor, delta);
  if (period === "주간") return addDaysStr(anchor, delta * 7);
  return shiftMonth(anchor, delta);
}

export default function SettlementsManager({ rows, phpToKrw }: { rows: SettlementRow[]; phpToKrw: number }) {
  const [grouping, setGrouping] = useState<Grouping>("강사별");
  const [period, setPeriod] = useState<Period>("월간");
  const [anchor, setAnchor] = useState<string>(() => todayKst());
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);

  const toggleSort = (key: SortKey) => setSort((prev) => (prev?.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const { start, end } = useMemo(() => interval(anchor, period), [anchor, period]);

  const inRangeRows = useMemo(() => rows.filter((r) => r.sessionDate >= start && r.sessionDate <= end), [rows, start, end]);

  const groups = useMemo(() => {
    const keyOf = (r: SettlementRow): { key: string; label: string } => {
      if (grouping === "센터별") return { key: r.centerId ?? "__none__", label: r.centerName ?? "미지정 센터" };
      if (grouping === "강사별") return { key: r.teacherId, label: r.teacherName };
      return { key: r.course, label: r.courseTitle };
    };
    const map = new Map<string, Group>();
    for (const r of inRangeRows) {
      const { key, label } = keyOf(r);
      let g = map.get(key);
      if (!g) {
        g = { key, label, count: 0, currencyTotals: new Map(), unpriced: 0, krwTotal: 0 };
        map.set(key, g);
      }
      g.count += 1;
      if (r.pricePerSession != null && r.currency) {
        g.currencyTotals.set(r.currency, (g.currencyTotals.get(r.currency) ?? 0) + r.pricePerSession);
        g.krwTotal += r.currency === "KRW" ? r.pricePerSession : (krwEquivalent(r.pricePerSession, r.currency, phpToKrw) ?? 0);
      } else {
        g.unpriced += 1;
      }
    }
    let list = Array.from(map.values());
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((g) => g.label.toLowerCase().includes(q));
    list.sort((a, b) => {
      if (!sort) return b.count - a.count; // 기본: 수업 수 내림차순
      let cmp: number;
      if (sort.key === "name") cmp = a.label.localeCompare(b.label, "ko");
      else if (sort.key === "count") cmp = a.count - b.count;
      else cmp = a.krwTotal - b.krwTotal;
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [inRangeRows, grouping, query, sort, phpToKrw]);

  const totals = useMemo(() => {
    let count = 0;
    let krwTotal = 0;
    let unpriced = 0;
    for (const g of groups) {
      count += g.count;
      krwTotal += g.krwTotal;
      unpriced += g.unpriced;
    }
    return { count, krwTotal, unpriced };
  }, [groups]);

  return (
    <div>
      <h1 className="text-ink text-2xl font-extrabold">강사 정산</h1>
      <p className="text-muted-fg mt-1 text-sm">
        실제 진행된 수업(강사 입장 + 피드백 작성)만 집계합니다. 지급 단가는 강사의 현재 소속 센터의 회당 단가를 기준으로 하며, 학생 출석 여부와는
        무관합니다.
      </p>

      {/* 분류 + 기간 단위 토글 */}
      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2">
          <span className="text-muted-fg-faint text-xs font-semibold">분류</span>
          <div className="flex gap-1.5">
            {GROUPINGS.map((g) => (
              <ToggleChip key={g} active={grouping === g} onClick={() => setGrouping(g)} label={g} />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-fg-faint text-xs font-semibold">기간</span>
          <div className="flex gap-1.5">
            {PERIODS.map((p) => (
              <ToggleChip key={p} active={period === p} onClick={() => setPeriod(p)} label={p} />
            ))}
          </div>
        </div>
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
        <span className="text-muted-fg-faint ml-auto text-xs">주 시작: 월요일</span>
      </div>

      {/* 검색 */}
      <div className="border-rule mt-4 flex items-center gap-2 rounded-lg border bg-white px-3">
        <Search className="text-muted-fg-faint size-4" aria-hidden />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`${grouping === "센터별" ? "센터" : grouping === "강사별" ? "강사" : "과정"} 검색...`}
          className="h-10 flex-1 bg-transparent text-sm outline-none"
        />
      </div>

      {totals.unpriced > 0 && (
        <p className="bg-brand/5 border-brand/30 text-brand mt-4 rounded-lg border px-3.5 py-2.5 text-sm">
          단가 미설정 {totals.unpriced}건 — 센터가 미지정이거나 센터 회당 단가가 설정되지 않은 강사의 수업입니다. 수업 수에는 포함되나 금액 합계에서는 제외됩니다.
        </p>
      )}

      {/* 집계 테이블 */}
      <div className="border-rule mt-4 overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-rule bg-surface text-muted-fg-faint border-b text-left text-xs font-semibold">
              <SortHeader label={grouping.replace("별", "")} sortKey="name" sort={sort} onSort={toggleSort} className="px-4 py-2.5 md:px-6" />
              <SortHeader label="진행 수업" sortKey="count" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
              <SortHeader label="지급 예정액" sortKey="amount" sort={sort} onSort={toggleSort} className="px-4 py-2.5 md:px-6" />
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-muted-fg px-6 py-12 text-center text-sm">
                  이 기간에 진행된 수업이 없습니다.
                </td>
              </tr>
            ) : (
              groups.map((g) => (
                <tr key={g.key} className="border-rule border-b transition-colors last:border-b-0">
                  <td className="text-ink px-4 py-3.5 align-middle font-semibold md:px-6">
                    {g.label}
                    {g.unpriced > 0 && <span className="text-brand ml-1.5 text-xs font-medium">단가 미설정 {g.unpriced}</span>}
                  </td>
                  <td className="text-ink px-4 py-3.5 align-middle whitespace-nowrap">
                    {g.count}
                    <span className="text-muted-fg-faint">회</span>
                  </td>
                  <td className="text-ink px-4 py-3.5 align-middle md:px-6">
                    <AmountCell currencyTotals={g.currencyTotals} phpToKrw={phpToKrw} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {groups.length > 0 && (
            <tfoot>
              <tr className="border-rule bg-surface border-t-2 font-bold">
                <td className="text-ink px-4 py-3 align-middle md:px-6">합계</td>
                <td className="text-ink px-4 py-3 align-middle whitespace-nowrap">
                  {totals.count}
                  <span className="text-muted-fg-faint font-medium">회</span>
                </td>
                <td className="text-ink px-4 py-3 align-middle whitespace-nowrap md:px-6">
                  ≈ {formatPrice(totals.krwTotal, "KRW")}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function AmountCell({ currencyTotals, phpToKrw }: { currencyTotals: Map<string, number>; phpToKrw: number }) {
  const entries = Array.from(currencyTotals.entries()).filter(([, amt]) => amt > 0);
  if (entries.length === 0) return <span className="text-muted-fg-faint">—</span>;
  return (
    <div className="flex flex-col gap-0.5">
      {entries.map(([cur, amt]) => {
        const eq = krwEquivalent(amt, cur, phpToKrw);
        return (
          <span key={cur} className="whitespace-nowrap">
            {formatPrice(amt, cur)}
            {eq != null && <span className="text-muted-fg-faint ml-1.5">≈ {formatPrice(eq, "KRW")}</span>}
          </span>
        );
      })}
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
