import { getCourse } from "@/data/courses";
import { kstDateMinToMs } from "@/lib/classtime";
import { lessonEndMin, isValidSlot, type Slot } from "@/lib/availability";
import type { ClassItem } from "@/components/classroom/ClassroomList";

// classes 조회 컬럼(내 강의실 학생/강사 공용).
export const CLASS_SELECT =
  "id, enrollment_id, course, course_title, teacher_name, student_name, student_english_name, session_no, session_date, start_min, end_min, status, is_makeup, cancel_reason, feedback, feedback_at, teacher_entered_at, conducted_at, conducted_override, teacher_reassigned_at";

type ClassRow = {
  id: string;
  enrollment_id: string;
  course: string;
  course_title: string;
  teacher_name: string | null;
  student_name: string | null;
  student_english_name: string | null;
  session_no: number;
  session_date: string;
  start_min: number;
  end_min: number;
  status: "예정" | "취소";
  is_makeup: boolean;
  cancel_reason: string | null;
  feedback: string | null;
  feedback_at: string | null;
  teacher_entered_at: string | null;
  conducted_at: string | null;
  conducted_override: boolean | null;
  teacher_reassigned_at: string | null;
};

// classes 행 → ClassItem(클라 표시용). 강사 화면은 영문 과정명·학생 영문명, 학생 화면은 한글 스냅샷.
// slotsByEnrollment: enrollment_id → 현재 주간 템플릿(enrollments.slots). 주간 요일 요약(weekdaySummary)용.
export function mapClassRows(rows: ClassRow[], isTeacher: boolean, slotsByEnrollment?: Map<string, Slot[]>): ClassItem[] {
  return rows.map((c) => ({
    id: c.id,
    enrollmentId: c.enrollment_id,
    enrollmentSlots: slotsByEnrollment?.get(c.enrollment_id),
    courseTitle: isTeacher ? (getCourse(c.course)?.englishTitle ?? c.course_title) : c.course_title,
    counterpart: isTeacher ? c.student_english_name || c.student_name || "학생" : c.teacher_name || "강사",
    sessionNo: c.session_no,
    sessionDate: c.session_date,
    startMin: c.start_min,
    endMin: c.end_min,
    startMs: kstDateMinToMs(c.session_date, c.start_min),
    endMs: kstDateMinToMs(c.session_date, lessonEndMin(c.end_min)),
    status: c.status,
    isMakeup: c.is_makeup,
    cancelReason: c.cancel_reason,
    feedback: c.feedback,
    feedbackAt: c.feedback_at,
    teacherEnteredAt: c.teacher_entered_at,
    conductedAt: c.conducted_at,
    conductedOverride: c.conducted_override,
    reassignedAt: c.teacher_reassigned_at,
  }));
}

// 본인(학생 또는 강사) 클래스 로드. supabase = 요청 스코프 SSR 클라(RLS로 본인 것만).
export async function loadClasses(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  isTeacher: boolean,
): Promise<ClassItem[]> {
  const { data } = await supabase
    .from("classes")
    .select(CLASS_SELECT)
    .eq(isTeacher ? "teacher_id" : "student_id", userId)
    .order("session_date", { ascending: true })
    .order("start_min", { ascending: true });
  const rows = (data ?? []) as ClassRow[];

  // 현재 주간 템플릿(enrollments.slots) 조회 — 주간 요일 요약을 일정 변경 반영값으로 표시.
  // RLS(_select_own_student/_select_own_teacher)로 본인 enrollment만. 없으면 클래스 파생 폴백.
  const slotsByEnrollment = new Map<string, Slot[]>();
  const enrollmentIds = Array.from(new Set(rows.map((r) => r.enrollment_id)));
  if (enrollmentIds.length > 0) {
    const { data: enrRows } = await supabase.from("enrollments").select("id, slots").in("id", enrollmentIds);
    for (const e of (enrRows ?? []) as { id: string; slots: unknown }[]) {
      const s = (Array.isArray(e.slots) ? e.slots : []).filter(isValidSlot).map((x) => ({ day: Number(x.day), min: Number(x.min) }));
      slotsByEnrollment.set(e.id, s);
    }
  }

  return mapClassRows(rows, isTeacher, slotsByEnrollment);
}
