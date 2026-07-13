import "server-only";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createAdminClient, getAdminEmails } from "@/utils/supabase/admin";
import { getOrigin } from "@/lib/origin";
import { sendSms } from "@/lib/sms";
import { sendClassReassignToAdmin, sendClassReassignToNewTeacher, sendClassReassignToOldTeacher } from "@/lib/mailer";
import { teacherHasAllSlots, fmtTime, SLOT_MIN, LESSON_MIN, type Slot } from "@/lib/availability";
import { kstDateMinToMs } from "@/lib/classtime";
import { weekdayOf } from "@/lib/makeup";
import { logEnrollmentEvent } from "@/lib/events";

// 개별 회차 강사 대체 공유 코어 — admin(adminReassignClass)·센터 매니저(centerReassignClass) 공용.
// 상태 '예정'·시작 전 회차만, 새 강사 주간 가용 + 같은 날 시간충돌 검증 후 teacher_id/name만 교체(시간·학생 불변).
// constrainCenterIds 지정 시(센터 매니저): 현재 강사·새 강사가 모두 그 센터 집합 소속이어야 통과.
const CLASS_MANAGE_SELECT =
  "id, enrollment_id, student_id, teacher_id, original_teacher_id, course, course_title, teacher_name, student_name, student_english_name, session_no, session_date, start_min, end_min, status, is_makeup, conducted_at, conducted_override";

export async function reassignClassCore(
  admin: ReturnType<typeof createAdminClient>,
  input: {
    classId: string;
    newTeacherId: string;
    actor: { id: string; role: "admin" | "center_manager" };
    constrainCenterIds?: string[];
  },
): Promise<{ ok: boolean; error?: string }> {
  const id = String(input.classId ?? "").trim();
  const teacherId = String(input.newTeacherId ?? "").trim();
  if (!id || !teacherId) return { ok: false, error: "잘못된 요청입니다." };

  const { data: cls } = await admin.from("classes").select(CLASS_MANAGE_SELECT).eq("id", id).maybeSingle();
  if (!cls) return { ok: false, error: "수업을 찾을 수 없습니다." };
  if (cls.status !== "예정") return { ok: false, error: "예정 상태의 수업만 강사를 변경할 수 있습니다." };
  // 시작 시각 지난 회차는 대체 불가 — 진행 중/지난 수업은 강사가 바뀔 여지가 없음(노쇼 사후 처리는 연기/취소로).
  if (Date.now() >= kstDateMinToMs(cls.session_date, cls.start_min)) {
    return { ok: false, error: "이미 시작된 수업은 강사를 변경할 수 없습니다." };
  }
  if (cls.teacher_id === teacherId) return { ok: false, error: "현재 강사와 다른 강사를 선택해 주세요." };

  // 현재 강사·새 강사 프로필(역할·센터·이름) 일괄 조회.
  const { data: profs } = await admin.from("profiles").select("id, first_name, last_name, role, center_id").in("id", [cls.teacher_id, teacherId]);
  const newProf = (profs ?? []).find((p: { id: string }) => p.id === teacherId) as
    | { id: string; first_name: string | null; last_name: string | null; role: string; center_id: string | null }
    | undefined;
  const curProf = (profs ?? []).find((p: { id: string }) => p.id === cls.teacher_id) as { center_id: string | null } | undefined;
  if (!newProf || newProf.role !== "teacher") return { ok: false, error: "유효한 강사가 아닙니다." };

  // 센터 매니저 스코프 제약 — 현재 강사·새 강사 모두 담당 센터 소속이어야 함.
  if (input.constrainCenterIds) {
    const set = new Set(input.constrainCenterIds);
    if (!curProf?.center_id || !set.has(curProf.center_id)) return { ok: false, error: "담당 센터 소속 강사의 수업만 변경할 수 있습니다." };
    if (!newProf.center_id || !set.has(newProf.center_id)) return { ok: false, error: "같은 센터 소속 강사로만 대체할 수 있습니다." };
  }

  const newName = [newProf.first_name, newProf.last_name].filter(Boolean).join(" ").trim() || "강사";

  // 새 강사 주간 가용 검증 — 이 수업의 모든 30분 슬롯이 새 강사 가용시간 안에 있어야 함.
  const dow = weekdayOf(cls.session_date);
  const requested: Slot[] = [];
  for (let min = cls.start_min; min < cls.end_min; min += 30) requested.push({ day: dow, min });
  const { data: slotRows } = await admin.from("teacher_availability").select("day_of_week, start_min").eq("teacher_id", teacherId);
  const teacherSlots: Slot[] = (slotRows ?? []).map((r: { day_of_week: number; start_min: number }) => ({ day: r.day_of_week, min: r.start_min }));
  if (!teacherHasAllSlots(teacherSlots, requested)) {
    return { ok: false, error: "선택한 강사의 주간 가용시간이 아닙니다. 다른 강사를 선택해 주세요." };
  }

  // 충돌 검증 — 같은 날짜에 새 강사의 다른 '예정' 수업과 시간이 겹치면 차단.
  const { data: sameDay } = await admin
    .from("classes")
    .select("id, teacher_id, start_min, end_min, status")
    .eq("session_date", cls.session_date)
    .eq("status", "예정")
    .neq("id", id);
  const conflict = (sameDay ?? []).some(
    (o: { teacher_id: string; start_min: number; end_min: number }) =>
      o.teacher_id === teacherId && cls.start_min < o.end_min && o.start_min < cls.end_min,
  );
  if (conflict) return { ok: false, error: "선택한 강사가 같은 시간에 다른 예정 수업이 있습니다. 다른 강사를 선택해 주세요." };

  const oldTeacherId = cls.teacher_id;
  const oldTeacherName = cls.teacher_name;
  const { data: updated, error: updErr } = await admin
    .from("classes")
    // original_teacher_id: 최초 대체 시의 원 강사만 보존(coalesce) — 원 강사 read-only 조회용.
    .update({
      teacher_id: teacherId,
      teacher_name: newName,
      teacher_reassigned_at: new Date().toISOString(),
      original_teacher_id: cls.original_teacher_id ?? oldTeacherId,
    })
    .eq("id", id)
    .eq("status", "예정")
    .select("id");
  if (updErr) return { ok: false, error: "강사 변경 처리 중 오류가 발생했습니다." };
  if (!updated || updated.length === 0) return { ok: false, error: "이미 처리된 수업입니다." };

  const lessonEnd = cls.end_min - (SLOT_MIN - LESSON_MIN);
  const sessionTime = `${fmtTime(cls.start_min)}~${fmtTime(lessonEnd)}`;

  // 학생 결과 SMS (best-effort) — enrollment 스냅샷 번호 사용.
  try {
    const { data: enr } = await admin.from("enrollments").select("student_phone").eq("id", cls.enrollment_id).maybeSingle();
    if (enr?.student_phone) {
      await sendSms(
        enr.student_phone,
        `[프렌딩 스쿨] ${cls.session_date} ${sessionTime} ${cls.course_title} 수업의 담당 강사가 ${newName} 강사로 변경되었습니다. 자세한 내용은 마이페이지(내 강의실)에서 확인하세요.`,
      );
    }
  } catch (err) {
    console.error("[reassignClassCore] 학생 SMS 발송 실패:", err);
  }

  // 강사 알림 메일 (best-effort) — 새 강사(배정)·기존 강사(이관).
  try {
    const origin = getOrigin(await headers());
    const teacherUrl = `${origin}/teacher`;
    const base = {
      studentName: cls.student_english_name || cls.student_name || "Student",
      courseTitle: cls.course_title,
      sessionDate: cls.session_date,
      sessionTime,
      oldTeacherName: oldTeacherName ?? undefined,
      newTeacherName: newName,
      teacherUrl,
    };
    const { data: newUser } = await admin.auth.admin.getUserById(teacherId);
    const newEmail = newUser?.user?.email;
    if (newEmail) await sendClassReassignToNewTeacher([newEmail], base);
    const { data: oldUser } = await admin.auth.admin.getUserById(oldTeacherId);
    const oldEmail = oldUser?.user?.email;
    if (oldEmail) await sendClassReassignToOldTeacher([oldEmail], base);
  } catch (err) {
    console.error("[reassignClassCore] 강사 알림 발송 실패:", err);
  }

  // 관리자 알림 메일 (센터 매니저가 대체할 때만, best-effort) — admin 본인 대체는 제외.
  if (input.actor.role === "center_manager") {
    try {
      const adminEmails = await getAdminEmails();
      if (adminEmails.length > 0) {
        // Resend는 초당 2건 제한 — 위 강사 2건 직후라 짧게 간격을 둬 rate limit(429) 회피.
        await new Promise((resolve) => setTimeout(resolve, 1100));
        const origin = getOrigin(await headers());
        // 대체를 실행한 센터 매니저 이름.
        const { data: actorProf } = await admin.from("profiles").select("first_name, last_name").eq("id", input.actor.id).maybeSingle();
        const actorName = actorProf ? [actorProf.first_name, actorProf.last_name].filter(Boolean).join(" ").trim() : "";
        // 담당 센터명(새 강사 소속 센터).
        let centerName: string | undefined;
        if (newProf.center_id) {
          const { data: ctr } = await admin.from("centers").select("name").eq("id", newProf.center_id).maybeSingle();
          centerName = ctr?.name ?? undefined;
        }
        await sendClassReassignToAdmin(adminEmails, {
          studentName: cls.student_english_name || cls.student_name || "Student",
          courseTitle: cls.course_title,
          sessionDate: cls.session_date,
          sessionTime,
          oldTeacherName: oldTeacherName ?? undefined,
          newTeacherName: newName,
          centerName,
          actorName: actorName || undefined,
          adminUrl: `${origin}/admin/classes/${cls.enrollment_id}`,
        });
      }
    } catch (err) {
      console.error("[reassignClassCore] 관리자 알림 발송 실패:", err);
    }
  }

  await logEnrollmentEvent(admin, {
    enrollmentId: cls.enrollment_id,
    classId: cls.id,
    eventType: "class_reassigned",
    actorId: input.actor.id,
    actorRole: input.actor.role,
    course: cls.course,
    courseTitle: cls.course_title,
    studentName: cls.student_name,
    teacherName: newName,
    detail: {
      sessionNo: cls.session_no,
      sessionDate: cls.session_date,
      oldTeacher: { id: oldTeacherId, name: oldTeacherName },
      newTeacher: { id: teacherId, name: newName },
    },
  });

  revalidatePath("/admin/classes");
  revalidatePath(`/admin/classes/${cls.enrollment_id}`);
  revalidatePath("/teacher", "layout");
  revalidatePath("/mypage", "layout");
  revalidatePath("/center");
  return { ok: true };
}
