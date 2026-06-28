import "server-only";
import type { createAdminClient } from "@/utils/supabase/admin";

// 'YYYY-MM-DD' 파싱/포맷 (TZ 비종속).
export const weekdayOf = (d: string): number => {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).getUTCDay();
};
export const addDaysStr = (d: string, days: number): string => {
  const [y, m, day] = d.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, day));
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
};

// 보강 생성에 필요한 클래스 스냅샷.
export type ClassForMakeup = {
  enrollment_id: string;
  student_id: string;
  teacher_id: string;
  course: string;
  course_title: string;
  teacher_name: string | null;
  student_name: string | null;
  student_english_name: string | null;
  session_date: string;
  start_min: number;
  end_min: number;
};

// 취소된 수업 1회에 대한 자동 보강 생성(best-effort). 과정 전체 마지막 수업일 다음으로,
// 주간 스케줄(요일 집합)을 따라 가장 빠른 수업일에 1회 생성. session_no=enrollment 최대+1, is_makeup=true.
// 성공 시 보강 날짜('YYYY-MM-DD') 반환, 실패 시 undefined(예외 throw 안 함).
export async function createMakeupClass(admin: ReturnType<typeof createAdminClient>, cls: ClassForMakeup): Promise<string | undefined> {
  try {
    const { data: all } = await admin.from("classes").select("session_no, session_date, start_min, end_min").eq("enrollment_id", cls.enrollment_id);
    const rows = (all ?? []) as { session_no: number; session_date: string; start_min: number; end_min: number }[];
    // 요일 → 시각 맵(스케줄 요일 집합 W). 균일 스케줄이지만 요일별 시간 차이도 견고하게 처리.
    const dayTime = new Map<number, { start_min: number; end_min: number }>();
    for (const r of rows) {
      const dow = weekdayOf(r.session_date);
      if (!dayTime.has(dow)) dayTime.set(dow, { start_min: r.start_min, end_min: r.end_min });
    }
    // 전체 최대 session_date 다음으로, 스케줄 요일에 해당하는 첫 날짜.
    const lastDate = rows.reduce((mx, r) => (r.session_date > mx ? r.session_date : mx), cls.session_date);
    let d = addDaysStr(lastDate, 1);
    for (let i = 0; i < 7 && !dayTime.has(weekdayOf(d)); i++) d = addDaysStr(d, 1);
    const time = dayTime.get(weekdayOf(d)) ?? { start_min: cls.start_min, end_min: cls.end_min };
    const maxSessionNo = rows.reduce((mx, r) => Math.max(mx, r.session_no), 0);
    const { error: insErr } = await admin.from("classes").insert({
      enrollment_id: cls.enrollment_id,
      student_id: cls.student_id,
      teacher_id: cls.teacher_id,
      course: cls.course,
      course_title: cls.course_title,
      teacher_name: cls.teacher_name,
      student_name: cls.student_name,
      student_english_name: cls.student_english_name,
      session_no: maxSessionNo + 1,
      session_date: d,
      start_min: time.start_min,
      end_min: time.end_min,
      is_makeup: true,
    });
    if (insErr) {
      console.error("[createMakeupClass] 보강 생성 실패:", insErr);
      return undefined;
    }
    return d;
  } catch (err) {
    console.error("[createMakeupClass] 보강 생성 예외:", err);
    return undefined;
  }
}
