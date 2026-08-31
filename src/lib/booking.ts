import "server-only";

import { deriveBookedSlots, isValidSlot, lessonEndDate, lessonEndMin, TOTAL_SESSIONS, type BookedSlot, type Slot } from "@/lib/availability";
import { kstDateMinToMs } from "@/lib/classtime";

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
// 종료 = 남은 '예정' 수업(레슨 종료 시각이 아직 안 지남)이 없음(보강·일정변경 반영). 마지막 수업의 레슨 종료 시각 이후 즉시 해제.
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
  const now = Date.now();

  // 클래스 현황 파생 — 클래스 존재 여부 + 남은 '예정' 수업 존재 여부(enrollment_id별).
  const { data: clsRows } = await admin.from("classes").select("enrollment_id, session_date, end_min, status").in("teacher_id", teacherIds);
  const hasClass = new Set<string>();
  const hasFuture = new Set<string>();
  for (const c of (clsRows ?? []) as { enrollment_id: string; session_date: string; end_min: number; status: string }[]) {
    hasClass.add(c.enrollment_id);
    // 시간 기준: 레슨 종료 시각(lessonEndMin)이 아직 안 지난 '예정' 수업만 미래로 취급(강의실·admin 목록과 동일 기준).
    if (c.status === "예정" && kstDateMinToMs(c.session_date, lessonEndMin(c.end_min)) >= now) hasFuture.add(c.enrollment_id);
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

// 슬롯 점유로 취급하는 enrollment 상태(진행중 전부). '거절'/'취소'는 제외.
export const ACTIVE_BOOKING_STATUSES = ["신청", "승인", "결제대기", "결제완료"] as const;

// 강사 1명의 예약 슬롯(가용 그리드 오버레이 + 잠금 판정) — 조회·종료필터·파생을 한 곳으로.
// 강사 프로필 page(세션 client)와 updateTeacherAvailability 서버 가드(service_role) 공용 단일 소스.
export async function loadTeacherBookedSlots(client: SupabaseLike, teacherId: string): Promise<BookedSlot[]> {
  const { data } = await client
    .from("enrollments")
    .select("id, slots, status, student_name, student_english_name")
    .eq("teacher_id", teacherId)
    .in("status", ACTIVE_BOOKING_STATUSES as unknown as string[]);
  const rows = (data ?? []) as { id: string; slots: unknown; status: string; student_name: string | null; student_english_name: string | null }[];
  if (rows.length === 0) return [];
  // 종료된 '결제완료'(남은 예정 수업 없음)는 점유에서 제외 — 마지막 수업 다음날부터 슬롯 해제.
  const ended = await loadEndedEnrollmentIds(client, [teacherId]);
  return deriveBookedSlots(rows.filter((r) => !(r.status === "결제완료" && ended.has(r.id))));
}

// 강사 여러 명의 예약 슬롯을 강사별로 union — 수강신청 매칭(가용 차감)용 순수 Slot[](tier/label 불필요).
// excludeStudentId를 주면 그 학생 본인의 신청은 차감에서 제외한다(본인이 잡은 시간에도 강사가 계속 보이게 —
// 본인 충돌은 loadStudentBusySlots + submitEnrollment의 전용 문구가 따로 처리한다).
export async function loadBookedSlotsByTeacher(client: SupabaseLike, teacherIds: string[], excludeStudentId?: string): Promise<Map<string, Slot[]>> {
  const byTeacher = new Map<string, Slot[]>();
  if (teacherIds.length === 0) return byTeacher;
  const { data } = await client
    .from("enrollments")
    .select("id, teacher_id, student_id, slots, status")
    .in("teacher_id", teacherIds)
    .in("status", ACTIVE_BOOKING_STATUSES as unknown as string[]);
  const rows = (data ?? []) as { id: string; teacher_id: string; student_id: string; slots: unknown; status: string }[];
  if (rows.length === 0) return byTeacher;
  // 종료된 '결제완료'(남은 예정 수업 없음)는 점유에서 제외 — 마지막 수업 다음날부터 슬롯 해제.
  const ended = await loadEndedEnrollmentIds(client, teacherIds);
  for (const r of rows) {
    if (r.status === "결제완료" && ended.has(r.id)) continue;
    if (excludeStudentId && r.student_id === excludeStudentId) continue;
    const list = byTeacher.get(r.teacher_id) ?? [];
    list.push(...parseSlots(r.slots));
    byTeacher.set(r.teacher_id, list);
  }
  return byTeacher;
}

// 학생 본인이 이미 잡고 있는 시간(강사 무관 통합) — 같은 시간 중복 신청 차단용.
// ⚠️ service_role 전용: loadEndedEnrollmentIds가 classes를 teacher_id로 조회하는데 학생 세션 client는
// 남의 수업 행을 못 읽어 '남은 예정 수업 없음'으로 오판 → 진행중 과정이 종료로 잘못 해제된다.
export async function loadStudentBusySlots(client: SupabaseLike, studentId: string): Promise<Slot[]> {
  const { data } = await client
    .from("enrollments")
    .select("id, teacher_id, slots, status")
    .eq("student_id", studentId)
    .in("status", ACTIVE_BOOKING_STATUSES as unknown as string[]);
  const rows = (data ?? []) as { id: string; teacher_id: string; slots: unknown; status: string }[];
  if (rows.length === 0) return [];
  // 종료 판정은 강사 단위 조회라 본인 '결제완료' 행의 teacher_id만 모아 넘긴다(초과 조회지만 교차 참조는 본인 행 id만).
  const paidTeacherIds = Array.from(new Set(rows.filter((r) => r.status === "결제완료").map((r) => r.teacher_id)));
  const ended = paidTeacherIds.length > 0 ? await loadEndedEnrollmentIds(client, paidTeacherIds) : new Set<string>();
  const out: Slot[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.status === "결제완료" && ended.has(r.id)) continue; // 끝난 과정 시간대는 재수강 신청 가능
    for (const s of parseSlots(r.slots)) {
      const k = `${s.day}-${s.min}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(s);
    }
  }
  return out;
}
