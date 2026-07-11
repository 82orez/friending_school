// 정산 단가 적용일 이력(rate_schedules) 역산 — 순수 로직(서버·클라 공용, TZ 비종속 문자열 날짜 비교).
// 단가 우선순위: 강사 개별 단가(teacher, price!=null) > 소속 센터 단가(center). teacher price=null 행 = "그 날짜부터 센터 단가 사용".

export type RateScope = "center" | "teacher";

export type RateRow = {
  id: string;
  scope: RateScope;
  scopeId: string;
  price: number | null;
  currency: string | null;
  effectiveFrom: string; // 'YYYY-MM-DD'
  note: string | null;
};

// scope+id에 대해 effective_from ≤ date 중 최신 행(없으면 null).
export function resolveScopeRate(rows: RateRow[], scope: RateScope, id: string, dateStr: string): RateRow | null {
  let best: RateRow | null = null;
  for (const r of rows) {
    if (r.scope !== scope || r.scopeId !== id) continue;
    if (r.effectiveFrom > dateStr) continue; // 아직 적용 전(미래 예약 포함)
    if (!best || r.effectiveFrom > best.effectiveFrom) best = r;
  }
  return best;
}

// 수업 1건의 유효 단가(강사 개별 우선, 없으면 센터, 둘 다 없으면 미설정).
export function effectiveRate(
  rows: RateRow[],
  teacherId: string,
  centerId: string | null,
  dateStr: string,
): { price: number | null; currency: string | null; isCustom: boolean } {
  const t = resolveScopeRate(rows, "teacher", teacherId, dateStr);
  if (t && t.price != null) return { price: t.price, currency: t.currency, isCustom: true };
  // teacher 행이 없거나 price=null(센터 복귀 센티널) → 센터로 폴백.
  const c = centerId ? resolveScopeRate(rows, "center", centerId, dateStr) : null;
  if (c && c.price != null) return { price: c.price, currency: c.currency, isCustom: false };
  return { price: null, currency: null, isCustom: false };
}

// KST 오늘 날짜 문자열('YYYY-MM-DD').
export function todayKstStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

// scope+id의 현재(오늘 기준) 유효 행 — 캐시 컬럼 동기화·요약 표시용.
export function currentRate(rows: RateRow[], scope: RateScope, id: string): RateRow | null {
  return resolveScopeRate(rows, scope, id, todayKstStr());
}
