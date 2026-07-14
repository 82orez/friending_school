// 주간 가능시간 슬롯 공유 모델 — 강사 편집 그리드(AvailabilityGrid)·강사 찾기(TeacherAvailabilityFinder)·
// 학생 수강신청 일정 선택(EnrollScheduleField)·서버 매칭 재검증이 모두 이 단일 소스를 사용한다.
// day: 0=일 ~ 6=토 (JS Date.getDay()와 동일, DB teacher_availability.day_of_week). min: 자정 기준 분(30 배수).

export const SLOT_MIN = 30;

// 30분 슬롯 = 25분 수업 + 5분 휴식. 표시용 수업 종료 = 슬롯 종료 − (SLOT_MIN − LESSON_MIN) → :25/:55.
// (슬롯 점유·매칭은 SLOT_MIN(30) 그대로. 표시·입장 시간창 종료는 LESSON_MIN 기준=lessonEndMin.)
export const LESSON_MIN = 25;

// 슬롯 종료(end_min)에서 휴식분을 뺀 실제 수업 종료 분. 표시·입장 종료 단일 소스.
export const lessonEndMin = (endMin: number): number => endMin - (SLOT_MIN - LESSON_MIN);

// 그리드 표시 범위(06:00~24:00). DB는 범위 비종속이라 변경 시 이 상수만 수정.
export const GRID_START_HOUR = 6;
export const GRID_END_HOUR = 24;

// 표시 순서 월~일 → 저장 day(0=일) 매핑.
export const DISPLAY_DAYS = [1, 2, 3, 4, 5, 6, 0];
export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAY_LABELS_KO = ["일", "월", "화", "수", "목", "금", "토"]; // index = day(0=일 ~ 6=토)
export const DAY_LABELS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]; // index = getDay(0=Sun ~ 6=Sat)

export type Slot = { day: number; min: number };

export const slotKey = (day: number, min: number) => `${day}-${min}`;

export const fmtTime = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

// YYYY-MM-DD → 요일 인덱스(0=일 ~ 6=토). UTC 파싱으로 TZ 비종속.
export const dowOf = (dateStr: string): number => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

// YYYY-MM-DD → "2026-07-04 (토)". 날짜 원문 유지 + 요일 접미.
export const formatDateKo = (dateStr: string): string => `${dateStr} (${DAY_LABELS_KO[dowOf(dateStr)]})`;

// 로케일 대응 날짜 라벨 — ko="2026-07-04 (토)" / en="2026-07-04 (Sat)". formatDateKo의 이중언어 버전.
export const formatDate = (dateStr: string, ko = true): string =>
  `${dateStr} (${(ko ? DAY_LABELS_KO : DAY_LABELS_EN)[dowOf(dateStr)]})`;

// 그리드 행(시작 분) 목록: 360(06:00) ~ 1410(23:30).
export const ROW_MINS: number[] = [];
for (let m = GRID_START_HOUR * 60; m < GRID_END_HOUR * 60; m += SLOT_MIN) ROW_MINS.push(m);

// 강사 슬롯 집합이 요청 슬롯 전부를 포함하는지(자유 슬롯 매칭). teacherSlots ⊇ requested.
export function teacherHasAllSlots(teacherSlots: Slot[], requested: Slot[]): boolean {
  if (requested.length === 0) return false;
  const set = new Set(teacherSlots.map((s) => slotKey(s.day, s.min)));
  return requested.every((s) => set.has(slotKey(s.day, s.min)));
}

// base에서 remove에 속한 슬롯을 제외(예약 소비 차감). teacher_availability − 승인된 예약 슬롯.
export function subtractSlots(base: Slot[], remove: Slot[]): Slot[] {
  if (remove.length === 0) return base;
  const removeSet = new Set(remove.map((s) => slotKey(s.day, s.min)));
  return base.filter((s) => !removeSet.has(slotKey(s.day, s.min)));
}

// 두 슬롯 목록이 하나라도 같은 슬롯을 공유하는지(시간 충돌 검사).
export function slotsOverlap(a: Slot[], b: Slot[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const set = new Set(a.map((s) => slotKey(s.day, s.min)));
  return b.some((s) => set.has(slotKey(s.day, s.min)));
}

// 같은 그룹(예: 강사) 안에서 슬롯이 서로 겹치는 항목들의 id 집합을 반환.
// 수강신청 목록에서 시간이 충돌하는 신청을 시각적으로 표시하는 용도(강사·admin 공용).
// 호출 측이 "진행중(신청/승인/결제대기)" 등 활성 행만 걸러 넘긴다. group=강사 식별자.
export function overlappingIds<T extends { id: string; group: string; slots: Slot[] }>(items: T[]): Set<string> {
  const out = new Set<string>();
  const byGroup = new Map<string, T[]>();
  for (const it of items) {
    const arr = byGroup.get(it.group);
    if (arr) arr.push(it);
    else byGroup.set(it.group, [it]);
  }
  for (const arr of Array.from(byGroup.values())) {
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        if (slotsOverlap(arr[i].slots, arr[j].slots)) {
          out.add(arr[i].id);
          out.add(arr[j].id);
        }
      }
    }
  }
  return out;
}

// 슬롯 유효성 — day 0~6, min 30배수 & [0,1439]. 서버 입력 검증 공용.
export function isValidSlot(s: unknown): s is Slot {
  if (!s || typeof s !== "object") return false;
  const day = Number((s as Slot).day);
  const min = Number((s as Slot).min);
  return Number.isInteger(day) && day >= 0 && day <= 6 && Number.isInteger(min) && min >= 0 && min <= 1439 && min % SLOT_MIN === 0;
}

// 슬롯 목록 → 요일별 그룹 요약 문자열. 표시용. ko=true면 한국어 요일(월~일), false면 영문(Mon~Sun).
// 예: "월 09:00, 09:30 · 수 14:00" / "Mon 09:00, 09:30 · Wed 14:00".
export function summarizeSlots(slots: Slot[], ko = true, sep = " · "): string {
  const byDay = new Map<number, number[]>();
  for (const s of slots) {
    const list = byDay.get(s.day) ?? [];
    list.push(s.min);
    byDay.set(s.day, list);
  }
  // 월~일 순서로 출력.
  return DISPLAY_DAYS.filter((d) => byDay.has(d))
    .map((d) => {
      const mins = (byDay.get(d) ?? []).sort((a, b) => a - b).map(fmtTime);
      const label = ko ? DAY_LABELS_KO[d] : DAY_LABELS[DISPLAY_DAYS.indexOf(d)];
      return `${label} ${mins.join(", ")}`;
    })
    .join(sep);
}

// 슬롯의 요일 집합 → 월~일 순 요일 라벨. ko "월/수/금" / en "Mon/Wed/Fri". (시간 제외)
export function summarizeWeekdays(slots: Slot[], ko = true): string {
  const days = new Set(slots.map((s) => s.day));
  return DISPLAY_DAYS.filter((d) => days.has(d))
    .map((d) => (ko ? DAY_LABELS_KO[d] : DAY_LABELS[DISPLAY_DAYS.indexOf(d)]))
    .join("/");
}

// 예약 슬롯(가용 그리드 오버레이용) — confirmed='승인'/'결제완료'(하드 확정), pending='결제대기'.
export type BookedSlot = { day: number; min: number; tier: "confirmed" | "pending"; label?: string };

// enrollment 행 목록 → 예약 슬롯. 강사 본인 그리드·admin 그리드 공용(파생 로직 단일 소스).
// confirmed 우선(같은 슬롯이 pending+confirmed면 confirmed), label은 툴팁용 학생 표시명.
export function deriveBookedSlots(
  rows: { slots: unknown; status: string; student_name?: string | null; student_english_name?: string | null }[],
): BookedSlot[] {
  const m = new Map<string, BookedSlot>();
  for (const r of rows) {
    const tier: BookedSlot["tier"] | null =
      r.status === "승인" || r.status === "결제완료" ? "confirmed" : r.status === "결제대기" ? "pending" : null;
    if (!tier) continue;
    const label = r.student_english_name || r.student_name || "Student";
    for (const s of (Array.isArray(r.slots) ? r.slots : []) as { day?: unknown; min?: unknown }[]) {
      const day = Number(s?.day);
      const min = Number(s?.min);
      if (!Number.isInteger(day) || !Number.isInteger(min)) continue;
      const k = slotKey(day, min);
      if (m.get(k)?.tier === "confirmed") continue; // confirmed 우선
      m.set(k, { day, min, tier, label });
    }
  }
  return Array.from(m.values());
}

// 과정 표준 수업 횟수(한 신청당) — 종료일·수업횟수 계산/표시 공용(위저드·강사 알림 메일).
export const TOTAL_SESSIONS = 24;

// 시작일부터 주간 반복 일정(slots의 요일)대로 진행해 totalSessions회째 수업이 있는 날을 반환.
// "요일 발생 횟수"만 세므로 TZ 비의존(로컬 Y/M/D 기준). 선택 요일 없거나 횟수<1이면 null.
export function lessonEndDate(start: Date, slots: Slot[], totalSessions: number): Date | null {
  const weekdays = new Set(slots.map((s) => s.day));
  if (weekdays.size === 0 || totalSessions < 1) return null;
  let remaining = totalSessions;
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  let last = new Date(cur);
  while (remaining > 0) {
    if (weekdays.has(cur.getDay())) {
      remaining--;
      last = new Date(cur);
      if (remaining === 0) break;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return last;
}

// 수업 기간 "시작일 ~ 종료일"(YYYY-MM-DD). 종료일=lessonEndDate, 계산 불가 시 시작일만. 클라/서버 공용 표시 헬퍼.
export function scheduleDateRange(startDate: string | null | undefined, slots: Slot[], totalSessions: number): string {
  if (!startDate) return "-";
  const [y, m, d] = startDate.split("-").map(Number);
  if (!y || !m || !d) return startDate;
  const end = lessonEndDate(new Date(y, m - 1, d), slots, totalSessions);
  if (!end) return startDate;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${startDate} ~ ${end.getFullYear()}-${p(end.getMonth() + 1)}-${p(end.getDate())}`;
}

// 개별 수업(클래스) 1회 = 매칭 요일 하루(같은 날 여러 슬롯이면 한 클래스, 시작=최소 min·종료=최대 min+30).
export type LessonSession = { sessionNo: number; date: Date; startMin: number; endMin: number };

// 시작일부터 주간 반복 일정대로 진행하며 totalSessions개의 날짜별 수업을 열거.
// lessonEndDate와 동일하게 "요일 발생 횟수"로 세므로 TZ 비의존(로컬 Y/M/D 기준).
export function enumerateLessonSessions(start: Date, slots: Slot[], totalSessions: number): LessonSession[] {
  // 요일별 시작/종료(분) — 같은 날 여러 슬롯은 한 수업으로 병합.
  const byDay = new Map<number, { startMin: number; endMin: number }>();
  for (const s of slots) {
    const cur = byDay.get(s.day);
    if (cur) {
      cur.startMin = Math.min(cur.startMin, s.min);
      cur.endMin = Math.max(cur.endMin, s.min + SLOT_MIN);
    } else {
      byDay.set(s.day, { startMin: s.min, endMin: s.min + SLOT_MIN });
    }
  }
  if (byDay.size === 0 || totalSessions < 1) return [];

  const out: LessonSession[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (out.length < totalSessions) {
    const span = byDay.get(cur.getDay());
    if (span) {
      out.push({ sessionNo: out.length + 1, date: new Date(cur), startMin: span.startMin, endMin: span.endMin });
    }
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}
