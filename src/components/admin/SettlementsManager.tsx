"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPrice, krwEquivalent, type Rates } from "@/data/currencies";
import { fmtTime } from "@/lib/availability";

// 서버 page가 conducted 수업 1건씩 enriched row로 전달(단가=강사 현재 소속 센터).
export type SettlementRow = {
  id: string;
  teacherId: string;
  teacherName: string;
  centerId: string | null;
  centerName: string | null;
  centerManager: string | null; // 센터 담당 매니저 이름(선택), 센터별 정산 표시용
  course: string;
  courseTitle: string;
  sessionDate: string; // 'YYYY-MM-DD' (KST)
  startMin: number; // 수업 시작 분(자정 기준)
  studentName: string | null;
  studentEnglishName: string | null;
  isMakeup: boolean;
  pricePerSession: number | null; // 센터 단가 미설정/센터 미지정 시 null
  currency: string | null; // pricePerSession 있을 때만
  isCustomRate: boolean; // 강사 개별 단가(센터 단가 오버라이드) 적용 여부
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
  manager: string | null; // 센터별 모드에서만 표시(센터 담당 매니저)
  custom: boolean; // 강사별 모드에서만 세팅(개별 단가 적용 강사) — 구분 배지용
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

// 행 배열을 keyOf 기준으로 그룹 집계(수업 수·통화별 합·원화 합·단가 미설정 수). 메인 표·상세 모달 공용.
function aggregate(
  rows: SettlementRow[],
  keyOf: (r: SettlementRow) => { key: string; label: string; manager?: string | null; custom?: boolean },
  rates: Rates,
): Group[] {
  const map = new Map<string, Group>();
  for (const r of rows) {
    const { key, label, manager, custom } = keyOf(r);
    let g = map.get(key);
    if (!g) {
      g = { key, label, manager: manager ?? null, custom: custom ?? false, count: 0, currencyTotals: new Map(), unpriced: 0, krwTotal: 0 };
      map.set(key, g);
    }
    g.count += 1;
    if (r.pricePerSession != null && r.currency) {
      g.currencyTotals.set(r.currency, (g.currencyTotals.get(r.currency) ?? 0) + r.pricePerSession);
      g.krwTotal += r.currency === "KRW" ? r.pricePerSession : (krwEquivalent(r.pricePerSession, r.currency, rates) ?? 0);
    } else {
      g.unpriced += 1;
    }
  }
  return Array.from(map.values());
}

export default function SettlementsManager({ rows, rates }: { rows: SettlementRow[]; rates: Rates }) {
  const [grouping, setGrouping] = useState<Grouping>("강사별");
  const [period, setPeriod] = useState<Period>("월간");
  const [anchor, setAnchor] = useState<string>(() => todayKst());
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  // 센터별 상세 모달 대상(센터별 모드에서만 열림).
  const [detailCenter, setDetailCenter] = useState<{ key: string; label: string; manager: string | null } | null>(null);

  const toggleSort = (key: SortKey) =>
    setSort((prev) => (prev?.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const { start, end } = useMemo(() => interval(anchor, period), [anchor, period]);

  const inRangeRows = useMemo(() => rows.filter((r) => r.sessionDate >= start && r.sessionDate <= end), [rows, start, end]);

  const groups = useMemo(() => {
    // 센터별 모드에서만 매니저 표시(같은 센터=같은 매니저); 그 외 모드에선 미사용.
    const keyOf = (r: SettlementRow): { key: string; label: string; manager?: string | null; custom?: boolean } => {
      if (grouping === "센터별") return { key: r.centerId ?? "__none__", label: r.centerName ?? "미지정 센터", manager: r.centerManager };
      if (grouping === "강사별") return { key: r.teacherId, label: r.teacherName, custom: r.isCustomRate };
      return { key: r.course, label: r.courseTitle };
    };
    let list = aggregate(inRangeRows, keyOf, rates);
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
  }, [inRangeRows, grouping, query, sort, rates]);

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
        실제 진행된 수업(강사 입장 + 피드백 작성)만 집계합니다. 지급 단가는 강사의 현재 소속 센터의 회당 단가를 기준으로 하되, 개별 단가가 설정된
        강사는 그 단가를 우선 적용하며, 학생 출석 여부와는 무관합니다.
      </p>

      {/* 분류 + 기간 단위 토글 */}
      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2">
          <span className="text-muted-fg-faint text-xs font-semibold">분류</span>
          <div className="flex gap-1.5">
            {GROUPINGS.map((g) => (
              <ToggleChip
                key={g}
                active={grouping === g}
                onClick={() => {
                  setGrouping(g);
                  if (g !== "센터별") setDetailCenter(null); // 분류 전환 시 stale 모달 닫기
                }}
                label={g}
              />
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
          단가 미설정 {totals.unpriced}건 — 센터가 미지정이거나 센터 회당 단가가 설정되지 않은 강사의 수업입니다. 수업 수에는 포함되나 금액 합계에서는
          제외됩니다.
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
              groups.map((g) => {
                const clickable = grouping === "센터별";
                const openDetail = () => setDetailCenter({ key: g.key, label: g.label, manager: g.manager });
                return (
                  <tr
                    key={g.key}
                    className={cn(
                      "border-rule border-b transition-colors last:border-b-0",
                      clickable && "hover:bg-surface/60 focus-visible:bg-surface/60 cursor-pointer outline-none",
                    )}
                    onClick={clickable ? openDetail : undefined}
                    onKeyDown={
                      clickable
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openDetail();
                            }
                          }
                        : undefined
                    }
                    tabIndex={clickable ? 0 : undefined}
                  >
                    <td className="text-ink px-4 py-3.5 align-middle font-semibold md:px-6">
                      <span className="inline-flex items-center gap-1">
                        {g.label}
                        {clickable && <ChevronRight className="text-muted-fg-faint size-4" aria-hidden />}
                        {g.custom && <CustomRateBadge />}
                        {g.unpriced > 0 && <span className="text-brand ml-1.5 text-xs font-medium">단가 미설정 {g.unpriced}</span>}
                      </span>
                      {grouping === "센터별" && (
                        <span className="text-muted-fg-faint mt-0.5 block text-xs font-medium">매니저: {g.manager || "미지정"}</span>
                      )}
                    </td>
                    <td className="text-ink px-4 py-3.5 align-middle whitespace-nowrap">
                      {g.count}
                      <span className="text-muted-fg-faint">회</span>
                    </td>
                    <td className="text-ink px-4 py-3.5 align-middle md:px-6">
                      <AmountCell currencyTotals={g.currencyTotals} rates={rates} />
                    </td>
                  </tr>
                );
              })
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
                <td className="text-ink px-4 py-3 align-middle whitespace-nowrap md:px-6">≈ {formatPrice(totals.krwTotal, "KRW")}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {detailCenter && (
        <SettlementDetailModal
          center={detailCenter}
          rows={rows}
          rates={rates}
          initialAnchor={anchor}
          initialPeriod={period}
          onClose={() => setDetailCenter(null)}
        />
      )}
    </div>
  );
}

// 센터별 상세 정산 모달 — 그 센터 소속 강사별 집계. 자체 주간/월간 토글 + 이전/다음(메인 기간과 독립).
const MODAL_PERIODS: Period[] = ["주간", "월간"];

// 강사 상세: 과정별 그룹(소계) + 날짜별 세션 목록.
type CourseDetail = {
  course: string;
  courseTitle: string;
  count: number;
  currencyTotals: Map<string, number>;
  unpriced: number;
  krwTotal: number;
  sessions: SettlementRow[];
};

// 'YYYY-MM-DD' → 'M/D (요일)'.
const fmtSessionDate = (d: string): string => {
  const [, m, day] = d.split("-").map(Number);
  return `${m}/${day} (${DOW_KO[weekdayOf(d)]})`;
};

// 단건 세션 금액(원화 환산 병기, 단가 미설정이면 —).
function SessionAmount({ row, rates }: { row: SettlementRow; rates: Rates }) {
  if (row.pricePerSession == null || !row.currency) return <span className="text-muted-fg-faint text-sm">—</span>;
  const eq = krwEquivalent(row.pricePerSession, row.currency, rates);
  return (
    <span className="text-ink text-sm whitespace-nowrap">
      {formatPrice(row.pricePerSession, row.currency)}
      {eq != null && <span className="text-muted-fg-faint ml-1.5">≈ {formatPrice(eq, "KRW")}</span>}
    </span>
  );
}

function SettlementDetailModal({
  center,
  rows,
  rates,
  initialAnchor,
  initialPeriod,
  onClose,
}: {
  center: { key: string; label: string; manager: string | null };
  rows: SettlementRow[];
  rates: Rates;
  initialAnchor: string;
  initialPeriod: Period;
  onClose: () => void;
}) {
  // 모달은 주간/월간만 — 메인이 일간이면 월간으로 시작.
  const [period, setPeriod] = useState<Period>(initialPeriod === "일간" ? "월간" : initialPeriod);
  const [anchor, setAnchor] = useState<string>(initialAnchor);

  // 열림 시: Esc 닫기 + body scroll lock.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const { start, end } = useMemo(() => interval(anchor, period), [anchor, period]);

  const groups = useMemo(() => {
    const inRange = rows.filter((r) => (r.centerId ?? "__none__") === center.key && r.sessionDate >= start && r.sessionDate <= end);
    const list = aggregate(inRange, (r) => ({ key: r.teacherId, label: r.teacherName, custom: r.isCustomRate }), rates);
    list.sort((a, b) => b.count - a.count); // 수업 수 내림차순
    return list;
  }, [rows, center.key, start, end, rates]);

  const totals = useMemo(
    () =>
      groups.reduce((acc, g) => ({ count: acc.count + g.count, krwTotal: acc.krwTotal + g.krwTotal, unpriced: acc.unpriced + g.unpriced }), {
        count: 0,
        krwTotal: 0,
        unpriced: 0,
      }),
    [groups],
  );

  // 강사 상세 뷰(선택된 강사의 과정별/날짜별 내역). null이면 강사 목록 뷰.
  const [selectedTeacher, setSelectedTeacher] = useState<{ id: string; name: string } | null>(null);

  const detail = useMemo(() => {
    if (!selectedTeacher) return null;
    const teacherRows = rows.filter(
      (r) => (r.centerId ?? "__none__") === center.key && r.teacherId === selectedTeacher.id && r.sessionDate >= start && r.sessionDate <= end,
    );
    const map = new Map<string, CourseDetail>();
    for (const r of teacherRows) {
      let g = map.get(r.course);
      if (!g) {
        g = { course: r.course, courseTitle: r.courseTitle, count: 0, currencyTotals: new Map(), unpriced: 0, krwTotal: 0, sessions: [] };
        map.set(r.course, g);
      }
      g.count += 1;
      g.sessions.push(r);
      if (r.pricePerSession != null && r.currency) {
        g.currencyTotals.set(r.currency, (g.currencyTotals.get(r.currency) ?? 0) + r.pricePerSession);
        g.krwTotal += r.currency === "KRW" ? r.pricePerSession : (krwEquivalent(r.pricePerSession, r.currency, rates) ?? 0);
      } else {
        g.unpriced += 1;
      }
    }
    const list = Array.from(map.values());
    for (const g of list) g.sessions.sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));
    list.sort((a, b) => (a.sessions[0]?.sessionDate ?? "").localeCompare(b.sessions[0]?.sessionDate ?? ""));
    const tot = list.reduce((acc, g) => ({ count: acc.count + g.count, krwTotal: acc.krwTotal + g.krwTotal, unpriced: acc.unpriced + g.unpriced }), {
      count: 0,
      krwTotal: 0,
      unpriced: 0,
    });
    return { list, tot };
  }, [selectedTeacher, rows, center.key, start, end, rates]);

  return (
    <>
      {/* 오버레이 */}
      <div aria-hidden="true" onClick={onClose} className="fixed inset-0 z-[110] bg-black/40" />

      {/* 패널 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="센터 정산 상세"
        className="fixed top-1/2 left-1/2 z-[120] flex max-h-[90vh] w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        <div className="border-rule flex items-start justify-between border-b px-6 py-4">
          <div className="min-w-0">
            {selectedTeacher ? (
              <>
                <button
                  type="button"
                  onClick={() => setSelectedTeacher(null)}
                  className="text-muted-fg hover:text-ink focus-visible:ring-accent-blue/50 mb-1 -ml-1 inline-flex items-center gap-1 rounded px-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
                >
                  <ArrowLeft className="size-3.5" aria-hidden />
                  뒤로
                </button>
                <h2 className="text-ink truncate text-lg font-bold">{selectedTeacher.name}</h2>
                <p className="text-muted-fg-faint mt-0.5 truncate text-xs">
                  {center.label} · 매니저 {center.manager || "미지정"}
                </p>
              </>
            ) : (
              <>
                <h2 className="text-ink truncate text-lg font-bold">{center.label}</h2>
                <p className="text-muted-fg-faint mt-0.5 text-xs">매니저: {center.manager || "미지정"}</p>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-muted-fg-faint hover:text-ink focus-visible:ring-accent-blue/50 ml-3 shrink-0 rounded transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-auto px-6 py-5">
          {/* 기간 컨트롤(주간/월간 토글 + 이전/다음/오늘) */}
          <div className="flex flex-wrap items-center gap-2">
            {MODAL_PERIODS.map((p) => (
              <ToggleChip key={p} active={period === p} onClick={() => setPeriod(p)} label={p} />
            ))}
            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setAnchor((a) => shiftAnchor(a, period, -1))}
                className="border-rule text-muted-fg hover:text-ink hover:border-accent-blue inline-flex size-7 items-center justify-center rounded-md border transition-colors"
                aria-label="이전 기간"
              >
                <ChevronLeft className="size-4" aria-hidden />
              </button>
              <span className="text-ink min-w-[7.5rem] text-center text-xs font-bold whitespace-nowrap">{periodLabel(anchor, period)}</span>
              <button
                type="button"
                onClick={() => setAnchor((a) => shiftAnchor(a, period, 1))}
                className="border-rule text-muted-fg hover:text-ink hover:border-accent-blue inline-flex size-7 items-center justify-center rounded-md border transition-colors"
                aria-label="다음 기간"
              >
                <ChevronRight className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setAnchor(todayKst())}
                className="border-rule text-muted-fg hover:text-ink rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
              >
                오늘
              </button>
            </div>
          </div>

          {!selectedTeacher && totals.unpriced > 0 && (
            <p className="bg-brand/5 border-brand/30 text-brand rounded-lg border px-3 py-2 text-xs">
              단가 미설정 {totals.unpriced}건 — 센터 회당 단가 미설정 수업입니다. 수업 수엔 포함되나 금액 합계에서는 제외됩니다.
            </p>
          )}

          {/* 강사 목록 뷰 */}
          {!selectedTeacher && (
            <div className="border-rule overflow-x-auto rounded-xl border">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-rule bg-surface text-muted-fg-faint border-b text-left text-xs font-semibold">
                    <th className="px-4 py-2.5">강사</th>
                    <th className="px-4 py-2.5">진행 수업</th>
                    <th className="px-4 py-2.5">지급 예정액</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="text-muted-fg px-4 py-10 text-center text-sm">
                        이 기간에 진행된 수업이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    groups.map((g) => {
                      const openTeacher = () => setSelectedTeacher({ id: g.key, name: g.label });
                      return (
                        <tr
                          key={g.key}
                          className="border-rule hover:bg-surface/60 focus-visible:bg-surface/60 cursor-pointer border-b outline-none last:border-b-0"
                          onClick={openTeacher}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openTeacher();
                            }
                          }}
                          tabIndex={0}
                        >
                          <td className="text-ink px-4 py-3 align-middle font-semibold">
                            <span className="inline-flex items-center gap-1">
                              {g.label}
                              <ChevronRight className="text-muted-fg-faint size-4" aria-hidden />
                              {g.custom && <CustomRateBadge />}
                              {g.unpriced > 0 && <span className="text-brand ml-1.5 text-xs font-medium">단가 미설정 {g.unpriced}</span>}
                            </span>
                          </td>
                          <td className="text-ink px-4 py-3 align-middle whitespace-nowrap">
                            {g.count}
                            <span className="text-muted-fg-faint">회</span>
                          </td>
                          <td className="text-ink px-4 py-3 align-middle">
                            <AmountCell currencyTotals={g.currencyTotals} rates={rates} />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {groups.length > 0 && (
                  <tfoot>
                    <tr className="border-rule bg-surface border-t-2 font-bold">
                      <td className="text-ink px-4 py-3 align-middle">합계</td>
                      <td className="text-ink px-4 py-3 align-middle whitespace-nowrap">
                        {totals.count}
                        <span className="text-muted-fg-faint font-medium">회</span>
                      </td>
                      <td className="text-ink px-4 py-3 align-middle whitespace-nowrap">≈ {formatPrice(totals.krwTotal, "KRW")}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

          {/* 강사 상세 뷰(과정별 그룹 + 날짜별 세션) */}
          {selectedTeacher &&
            detail &&
            (detail.list.length === 0 ? (
              <p className="text-muted-fg py-10 text-center text-sm">이 기간에 진행된 수업이 없습니다.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {detail.list.map((c) => (
                  <div key={c.course} className="border-rule overflow-hidden rounded-xl border">
                    <div className="border-rule bg-surface flex items-center justify-between gap-2 border-b px-4 py-2.5">
                      <span className="text-ink text-sm font-bold">
                        {c.courseTitle}
                        <span className="text-muted-fg-faint ml-1.5 font-medium">{c.count}회</span>
                        {c.unpriced > 0 && <span className="text-brand ml-1.5 text-xs font-medium">단가 미설정 {c.unpriced}</span>}
                      </span>
                      <AmountCell currencyTotals={c.currencyTotals} rates={rates} />
                    </div>
                    <ul>
                      {c.sessions.map((s) => (
                        <li key={s.id} className="border-rule flex items-center justify-between gap-3 border-b px-4 py-2 last:border-b-0">
                          <span className="min-w-0">
                            <span className="text-ink block text-sm">
                              {fmtSessionDate(s.sessionDate)} {fmtTime(s.startMin)}
                              {s.isMakeup && <span className="text-accent-blue-ink ml-1.5 text-xs font-medium">·보강</span>}
                            </span>
                            {(s.studentName || s.studentEnglishName) && (
                              <span className="text-muted-fg-faint mt-0.5 block truncate text-xs">
                                {s.studentName || s.studentEnglishName}
                                {s.studentName && s.studentEnglishName && ` (${s.studentEnglishName})`}
                              </span>
                            )}
                          </span>
                          <SessionAmount row={s} rates={rates} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <div className="border-rule bg-surface flex items-center justify-between rounded-xl border px-4 py-3 font-bold">
                  <span className="text-ink text-sm">
                    합계 <span className="text-muted-fg-faint font-medium">{detail.tot.count}회</span>
                  </span>
                  <span className="text-ink text-sm whitespace-nowrap">≈ {formatPrice(detail.tot.krwTotal, "KRW")}</span>
                </div>
              </div>
            ))}
        </div>
      </div>
    </>
  );
}

function AmountCell({ currencyTotals, rates }: { currencyTotals: Map<string, number>; rates: Rates }) {
  const entries = Array.from(currencyTotals.entries()).filter(([, amt]) => amt > 0);
  if (entries.length === 0) return <span className="text-muted-fg-faint">—</span>;
  return (
    <div className="flex flex-col gap-0.5">
      {entries.map(([cur, amt]) => {
        const eq = krwEquivalent(amt, cur, rates);
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

// 강사 개별 단가(센터 단가 오버라이드) 적용 표시 배지.
function CustomRateBadge() {
  return <span className="bg-accent-blue-soft text-accent-blue-ink ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold">개별 단가</span>;
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
