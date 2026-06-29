import "server-only";

import { isValidSlot, lessonEndDate, TOTAL_SESSIONS, type Slot } from "@/lib/availability";

// 슬롯 점유 종료 판정 공유 헬퍼. 슬롯을 점유로 취급하는 모든 지점(가용 차감·승인 충돌·그리드 표시)이 공용.
// service_role(admin) 또는 본인 세션 client 모두 받을 수 있게 느슨한 타입.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

// 오늘 날짜(KST) YYYY-MM-DD.
export function todayKst(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

function parseSlots(raw: unknown): Slot[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isValidSlot).map((s) => ({ day: Number(s.day), min: Number(s.min) }));
}

// start_date(YYYY-MM-DD)를 로컬 Date로 파싱(요일 발생 횟수만 세는 lessonEndDate와 TZ 비종속 일관).
function parseLocalDate(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd ?? "");
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function fmtLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// 종료된 '결제완료' enrollment id 집합 — 슬롯 점유에서 제외할 대상.
// 종료 = 남은 '예정' 수업(session_date >= 오늘KST)이 없음(보강·일정변경 반영). 마지막 수업 다음날부터 해제(오늘은 점유 유지).
// 클래스가 전혀 없는 '결제완료'(레거시/백필 전)는 lessonEndDate < 오늘KST 폴백으로 판정.
// '신청'/'결제대기'/'승인'은 대상 아님(클래스 생성 전 = 진행 전이라 종료 개념 미적용).
export async function loadEndedEnrollmentIds(admin: SupabaseLike, teacherIds: string[]): Promise<Set<string>> {
  const ended = new Set<string>();
  if (teacherIds.length === 0) return ended;

  const { data: enrRows } = await admin
    .from("enrollments")
    .select("id, start_date, slots, total_sessions")
    .in("teacher_id", teacherIds)
    .eq("status", "결제완료");
  const paid = (enrRows ?? []) as { id: string; start_date: string; slots: unknown; total_sessions: number | null }[];
  if (paid.length === 0) return ended;

  const today = todayKst();

  // 클래스 현황 파생 — 클래스 존재 여부 + 남은 '예정' 수업 존재 여부(enrollment_id별).
  const { data: clsRows } = await admin.from("classes").select("enrollment_id, session_date, status").in("teacher_id", teacherIds);
  const hasClass = new Set<string>();
  const hasFuture = new Set<string>();
  for (const c of (clsRows ?? []) as { enrollment_id: string; session_date: string; status: string }[]) {
    hasClass.add(c.enrollment_id);
    if (c.status === "예정" && c.session_date >= today) hasFuture.add(c.enrollment_id);
  }

  for (const e of paid) {
    if (hasClass.has(e.id)) {
      if (!hasFuture.has(e.id)) ended.add(e.id);
    } else {
      // 폴백(클래스 없음): 계획 종료일이 오늘 이전이면 종료.
      const start = parseLocalDate(e.start_date);
      const end = start ? lessonEndDate(start, parseSlots(e.slots), e.total_sessions ?? TOTAL_SESSIONS) : null;
      if (end && fmtLocalDate(end) < today) ended.add(e.id);
    }
  }

  return ended;
}
