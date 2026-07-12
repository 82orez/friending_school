import { getCourse } from "@/data/courses";
import { kstDateMinToMs } from "@/lib/classtime";
import { lessonEndMin, isValidSlot, type Slot } from "@/lib/availability";
import type { ClassItem } from "@/components/classroom/ClassroomList";

// classes 조회 컬럼(내 강의실 학생/강사 공용). teacher_id·original_teacher_id는 대체됨(reassigned-away) 판정용.
export const CLASS_SELECT =
  "id, enrollment_id, teacher_id, original_teacher_id, course, course_title, course_english_title, teacher_name, student_name, student_english_name, session_no, session_date, start_min, end_min, status, is_makeup, cancel_reason, feedback, feedback_at, teacher_entered_at, conducted_at, conducted_override, teacher_reassigned_at";

type ClassRow = {
  id: string;
  enrollment_id: string;
  teacher_id: string;
  original_teacher_id: string | null;
  course: string;
  course_title: string;
  course_english_title: string | null;
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
// userId: 강사 뷰에서 1회성 대체로 남에게 넘어간 회차(reassigned-away) 판정용(원 강사만 read-only 노출).
export function mapClassRows(
  rows: ClassRow[],
  isTeacher: boolean,
  slotsByEnrollment?: Map<string, Slot[]>,
  userId?: string,
  teacherByEnrollment?: Map<string, string | null>,
): ClassItem[] {
  return rows.map((c) => {
    // 원 강사(original_teacher_id=본인)인데 현재 담당(teacher_id)이 대타면 read-only 표시.
    const reassignedAway = isTeacher && !!userId && c.original_teacher_id === userId && c.teacher_id !== userId;
    // 대타(teacher_id=본인)인데 원 강사가 따로 있으면 "대체 담당" 정보 표시(액션은 정상).
    const coveringForOther = isTeacher && !!userId && c.teacher_id === userId && !!c.original_teacher_id && c.original_teacher_id !== userId;
    return {
    id: c.id,
    enrollmentId: c.enrollment_id,
    reassignedAway,
    coveringForOther,
    coveredByName: reassignedAway ? c.teacher_name : null, // teacher_name = 현재=대타 강사명
    enrollmentSlots: slotsByEnrollment?.get(c.enrollment_id),
    enrollmentTeacherName: teacherByEnrollment?.get(c.enrollment_id) ?? null,
    courseTitle: isTeacher ? (getCourse(c.course)?.englishTitle ?? c.course_english_title ?? c.course_title) : c.course_title,
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
    };
  });
}

// 본인(학생 또는 강사) 클래스 로드. supabase = 요청 스코프 SSR 클라(RLS로 본인 것만).
export async function loadClasses(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  isTeacher: boolean,
): Promise<ClassItem[]> {
  // 강사는 현재 담당(teacher_id) + 1회성 대체로 넘어간 원 강사 회차(original_teacher_id)까지(read-only 표시).
  // 학생은 본인 것만. RLS(own_teacher/original_teacher/own_student)가 각 행 접근을 허용.
  let q = supabase.from("classes").select(CLASS_SELECT);
  q = isTeacher ? q.or(`teacher_id.eq.${userId},original_teacher_id.eq.${userId}`) : q.eq("student_id", userId);
  const { data } = await q.order("session_date", { ascending: true }).order("start_min", { ascending: true });
  const rows = (data ?? []) as ClassRow[];

  // 현재 주간 템플릿(enrollments.slots) 조회 — 주간 요일 요약을 일정 변경 반영값으로 표시.
  // RLS(_select_own_student/_select_own_teacher)로 본인 enrollment만. 없으면 클래스 파생 폴백.
  // 동시에 환불/거절(status '취소'/'거절') enrollment는 강의실에서 제외 — 과정 전체 종료라 표시하지 않음.
  // (개별 수업 연기는 enrollment가 '결제완료' 유지 → 여기서 걸리지 않고 취소선으로 계속 노출.)
  const slotsByEnrollment = new Map<string, Slot[]>();
  const teacherByEnrollment = new Map<string, string | null>();
  const cancelledEnrollmentIds = new Set<string>();
  const enrollmentIds = Array.from(new Set(rows.map((r) => r.enrollment_id)));
  if (enrollmentIds.length > 0) {
    const { data: enrRows } = await supabase.from("enrollments").select("id, slots, status, teacher_name").in("id", enrollmentIds);
    for (const e of (enrRows ?? []) as { id: string; slots: unknown; status: string; teacher_name: string | null }[]) {
      const s = (Array.isArray(e.slots) ? e.slots : []).filter(isValidSlot).map((x) => ({ day: Number(x.day), min: Number(x.min) }));
      slotsByEnrollment.set(e.id, s);
      teacherByEnrollment.set(e.id, e.teacher_name ?? null); // 현재 담당 강사(강사 대체 반영) — 과정 카드 대표 강사용
      if (e.status === "취소" || e.status === "거절") cancelledEnrollmentIds.add(e.id);
    }
  }

  const visibleRows = cancelledEnrollmentIds.size > 0 ? rows.filter((r) => !cancelledEnrollmentIds.has(r.enrollment_id)) : rows;
  return mapClassRows(visibleRows, isTeacher, slotsByEnrollment, userId, teacherByEnrollment);
}
