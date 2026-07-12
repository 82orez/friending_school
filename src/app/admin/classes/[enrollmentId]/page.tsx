import { notFound } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import { loadEnrollTeachers } from "@/app/courses/enroll-actions";
import { DAY_LABELS_KO, DISPLAY_DAYS, dowOf, isValidSlot, type Slot } from "@/lib/availability";
import ClassesManager, { type AdminClass } from "@/components/admin/ClassesManager";
import EventTimeline, { type AdminEvent } from "@/components/admin/EventTimeline";

export default async function AdminClassDetailPage({ params }: { params: Promise<{ enrollmentId: string }> }) {
  const { enrollmentId } = await params;
  const admin = createAdminClient();
  const { data } = await admin
    .from("classes")
    .select(
      "id, enrollment_id, student_id, teacher_id, course, course_title, teacher_name, student_name, student_english_name, session_no, session_date, start_min, end_min, status, is_makeup, cancel_reason, feedback, feedback_at, teacher_entered_at, conducted_at, conducted_override, teacher_reassigned_at",
    )
    .eq("enrollment_id", enrollmentId)
    .order("session_no", { ascending: true });

  const classes = (data ?? []) as AdminClass[];
  if (classes.length === 0) notFound();

  const teachers = await loadEnrollTeachers();

  const first = classes[0];

  // 남은 일정 일괄 변경용 — 현재 주간 패턴(enrollment.slots) + 현재 담당 강사 주간 가용.
  // 강사·이름은 enrollments 기준(강사 대체 시 갱신됨) — 과거 회차 스냅샷(first.*)은 옛 강사라 대표값에 부적합.
  const { data: enrRow } = await admin.from("enrollments").select("slots, teacher_id, teacher_name").eq("id", enrollmentId).maybeSingle();
  const currentSlots: Slot[] = (Array.isArray(enrRow?.slots) ? enrRow!.slots : []).filter(isValidSlot).map((s: Slot) => ({ day: Number(s.day), min: Number(s.min) }));
  const currentTeacherId = enrRow?.teacher_id ?? first.teacher_id;
  const currentTeacherName = enrRow?.teacher_name ?? first.teacher_name;
  const { data: availRows } = await admin.from("teacher_availability").select("day_of_week, start_min").eq("teacher_id", currentTeacherId);
  const teacherSlots: Slot[] = (availRows ?? []).map((r: { day_of_week: number; start_min: number }) => ({ day: r.day_of_week, min: r.start_min }));

  // 강사 현재 소속 센터(teacher_id → profiles.center_id → centers.name) — 목록/모달과 동일 원칙.
  let centerName: string | null = null;
  if (currentTeacherId) {
    const { data: prof } = await admin.from("profiles").select("center_id").eq("id", currentTeacherId).maybeSingle();
    const cid = prof?.center_id ?? null;
    if (cid) {
      const { data: center } = await admin.from("centers").select("name").eq("id", cid).maybeSingle();
      centerName = center?.name ?? null;
    }
  }

  // 이 과정의 변경 이력(감사 로그) — 최신순.
  const { data: eventRows } = await admin
    .from("enrollment_events")
    .select("id, class_id, event_type, actor_role, actor_name, detail, created_at")
    .eq("enrollment_id", enrollmentId)
    .order("created_at", { ascending: false });
  const events = (eventRows ?? []) as AdminEvent[];

  const dates = classes.map((c) => c.session_date).sort();
  const studentLabel = first.student_name ?? "학생";
  const title = `${first.course_title} · ${studentLabel}`;
  // 주간 요일 요약(예: "월/수/금") — 현재 주간 템플릿(enrollments.slots) 기준. 일정 변경 시 과거 회차 오염 방지.
  // slots 비어있는 레거시만 정규 수업(취소·보강 제외) 날짜로 폴백.
  const scheduleDays = currentSlots.length
    ? new Set(currentSlots.map((s) => s.day))
    : new Set(classes.filter((c) => c.status !== "취소" && !c.is_makeup).map((c) => dowOf(c.session_date)));
  const weekdayLabel = DISPLAY_DAYS.filter((d) => scheduleDays.has(d))
    .map((d) => DAY_LABELS_KO[d])
    .join("/");
  const subtitle = `강사 ${currentTeacherName ?? "-"} · 센터 ${centerName ?? "미지정"}${weekdayLabel ? ` · 요일 ${weekdayLabel}` : ""} · 기간 ${dates[0]} ~ ${dates[dates.length - 1]} · 총 ${classes.length}회`;

  return (
    <div>
      <ClassesManager
        classes={classes}
        teachers={teachers}
        enrollmentId={enrollmentId}
        currentSlots={currentSlots}
        teacherSlots={teacherSlots}
        title={title}
        subtitle={subtitle}
        backHref="/admin/classes"
      />
      <EventTimeline events={events} />
    </div>
  );
}
