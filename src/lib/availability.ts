// 주간 가능시간 슬롯 공유 모델 — 강사 편집 그리드(AvailabilityGrid)·강사 찾기(TeacherAvailabilityFinder)·
// 학생 수강신청 일정 선택(EnrollScheduleField)·서버 매칭 재검증이 모두 이 단일 소스를 사용한다.
// day: 0=일 ~ 6=토 (JS Date.getDay()와 동일, DB teacher_availability.day_of_week). min: 자정 기준 분(30 배수).

export const SLOT_MIN = 30;

// 그리드 표시 범위(06:00~24:00). DB는 범위 비종속이라 변경 시 이 상수만 수정.
export const GRID_START_HOUR = 6;
export const GRID_END_HOUR = 24;

// 표시 순서 월~일 → 저장 day(0=일) 매핑.
export const DISPLAY_DAYS = [1, 2, 3, 4, 5, 6, 0];
export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAY_LABELS_KO = ["일", "월", "화", "수", "목", "금", "토"]; // index = day(0=일 ~ 6=토)

export type Slot = { day: number; min: number };

export const slotKey = (day: number, min: number) => `${day}-${min}`;

export const fmtTime = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

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

// 슬롯 유효성 — day 0~6, min 30배수 & [0,1439]. 서버 입력 검증 공용.
export function isValidSlot(s: unknown): s is Slot {
  if (!s || typeof s !== "object") return false;
  const day = Number((s as Slot).day);
  const min = Number((s as Slot).min);
  return Number.isInteger(day) && day >= 0 && day <= 6 && Number.isInteger(min) && min >= 0 && min <= 1439 && min % SLOT_MIN === 0;
}

// 슬롯 목록 → 요일별 그룹 요약 문자열. 표시용. ko=true면 한국어 요일(월~일), false면 영문(Mon~Sun).
// 예: "월 09:00, 09:30 · 수 14:00" / "Mon 09:00, 09:30 · Wed 14:00".
export function summarizeSlots(slots: Slot[], ko = true): string {
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
    .join(" · ");
}
