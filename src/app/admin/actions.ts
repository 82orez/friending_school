"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { isAdmin } from "@/lib/auth";
import { getOrigin } from "@/lib/origin";
import {
  sendTeacherApprovalNotification,
  sendTeacherRejectionNotification,
  sendClassCancellationToTeacher,
  sendEnrollmentPaymentConfirmedToTeacher,
  sendClassReassignToNewTeacher,
  sendClassReassignToOldTeacher,
  sendCourseReassignToNewTeacher,
  sendCourseReassignToOldTeacher,
} from "@/lib/mailer";
import { FOREIGN_CURRENCIES, normalizeCurrency } from "@/data/currencies";
import { getCourse } from "@/data/courses";
import { sendSms } from "@/lib/sms";
import {
  TOTAL_SESSIONS,
  enumerateLessonSessions,
  isValidSlot,
  teacherHasAllSlots,
  fmtTime,
  summarizeSlots,
  lessonEndDate,
  lessonEndMin,
  SLOT_MIN,
  LESSON_MIN,
  type Slot,
} from "@/lib/availability";
import { kstDateMinToMs } from "@/lib/classtime";
import { todayKst } from "@/lib/booking";
import { createMakeupClass, weekdayOf, addDaysStr, type ClassForMakeup } from "@/lib/makeup";
import { logEnrollmentEvent } from "@/lib/events";

export type ActionResult = { ok: boolean; error?: string };

// 모든 admin 액션의 진입 가드 — 세션 클라이언트로 admin 확인 후에만 service_role 쓰기 허용.
// 성공 시 admin user id 반환(감사 로그 actor_id용), 실패 시 null. 호출부 `if (!(await requireAdmin()))`는
// null=falsy / uuid=truthy로 동작 불변(requireTeacher와 동일 규약).
async function requireAdmin(): Promise<string | null> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return (await isAdmin(supabase, user.id)) ? user.id : null;
}

/* ===== 유튜브 관리 ===== */

export async function addYoutubeVideo(input: { tag: string; url: string; title: string; description: string }): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  const url = input.url?.trim();
  const title = input.title?.trim();
  if (!url || !title) return { ok: false, error: "제목과 URL은 필수입니다." };

  const admin = createAdminClient();
  // 새 영상은 맨 뒤로 (현재 최대 sort_order + 1)
  const { data: maxRow } = await admin.from("youtube_videos").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const nextOrder = ((maxRow as { sort_order?: number } | null)?.sort_order ?? 0) + 1;

  const { error } = await admin.from("youtube_videos").insert({
    tag: input.tag?.trim() || "",
    url,
    title,
    description: input.description?.trim() || "",
    sort_order: nextOrder,
  });
  if (error) return { ok: false, error: "등록 중 오류가 발생했습니다." };

  revalidatePath("/admin/youtube");
  revalidatePath("/");
  return { ok: true };
}

export async function updateYoutubeVideo(id: string, input: { tag: string; url: string; title: string; description: string }): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  const url = input.url?.trim();
  const title = input.title?.trim();
  if (!id || !url || !title) return { ok: false, error: "제목과 URL은 필수입니다." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("youtube_videos")
    .update({ tag: input.tag?.trim() || "", url, title, description: input.description?.trim() || "" })
    .eq("id", id);
  if (error) return { ok: false, error: "수정 중 오류가 발생했습니다." };

  revalidatePath("/admin/youtube");
  revalidatePath("/");
  return { ok: true };
}

export async function setYoutubeVisibility(id: string, isVisible: boolean): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { error } = await admin.from("youtube_videos").update({ is_visible: isVisible }).eq("id", id);
  if (error) return { ok: false, error: "변경 중 오류가 발생했습니다." };

  revalidatePath("/admin/youtube");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteYoutubeVideo(id: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { error } = await admin.from("youtube_videos").delete().eq("id", id);
  if (error) return { ok: false, error: "삭제 중 오류가 발생했습니다." };

  revalidatePath("/admin/youtube");
  revalidatePath("/");
  return { ok: true };
}

/* ===== 센터 관리 ===== */

// 센터 추가/수정/삭제 시 드롭다운·표시가 쓰이는 경로를 함께 갱신.
function revalidateCenterConsumers() {
  revalidatePath("/admin/centers");
  revalidatePath("/teacher/apply");
  revalidatePath("/teacher", "layout");
  revalidatePath("/admin/teacher-requests");
}

// 외화 1단위당 원화 환율 저장(settings.<code>_to_krw). admin만, 지원 통화·양수만 허용.
export async function updateExchangeRate(code: string, value: number | string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  const foreign = FOREIGN_CURRENCIES.find((f) => f.code === code);
  if (!foreign) return { ok: false, error: "지원하지 않는 통화입니다." };
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, error: "유효한 환율을 입력하세요." };

  const admin = createAdminClient();
  const { error } = await admin.from("settings").upsert({ key: foreign.settingKey, value: String(n) }, { onConflict: "key" });
  if (error) return { ok: false, error: "환율 저장 중 오류가 발생했습니다." };

  revalidatePath("/admin/centers");
  return { ok: true };
}

// 단가 입력 정규화: 빈 값/비숫자/음수 → null. USD는 소수 첫째자리까지, 그 외 통화는 정수로 내림.
function normalizePrice(raw: number | string | null | undefined, currency?: string | null): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return normalizeCurrency(currency) === "USD" ? Math.round(n * 10) / 10 : Math.floor(n);
}

// 매니저 이름 등 선택 텍스트 필드 정규화: trim 후 빈 값 → null.
function normalizeText(raw: string | null | undefined): string | null {
  const t = raw?.trim();
  return t ? t : null;
}

export async function addCenter(
  name: string,
  price?: number | string | null,
  currency?: string | null,
  managerName?: string | null,
): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  const clean = name?.trim();
  if (!clean) return { ok: false, error: "센터 이름은 필수입니다." };

  const admin = createAdminClient();
  // 새 센터는 목록 끝으로 (sort_order 자동 증가).
  const { data: maxRow } = await admin.from("centers").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const nextOrder = ((maxRow as { sort_order?: number } | null)?.sort_order ?? 0) + 1;

  const { error } = await admin.from("centers").insert({
    name: clean,
    sort_order: nextOrder,
    price_per_session: normalizePrice(price, currency),
    price_currency: normalizeCurrency(currency),
    manager_name: normalizeText(managerName),
  });
  if (error) return { ok: false, error: "등록 중 오류가 발생했습니다." };

  revalidateCenterConsumers();
  return { ok: true };
}

export async function updateCenter(
  id: string,
  name: string,
  price?: number | string | null,
  currency?: string | null,
  managerName?: string | null,
): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  const clean = name?.trim();
  if (!id || !clean) return { ok: false, error: "센터 이름은 필수입니다." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("centers")
    .update({ name: clean, price_per_session: normalizePrice(price, currency), price_currency: normalizeCurrency(currency), manager_name: normalizeText(managerName) })
    .eq("id", id);
  if (error) return { ok: false, error: "수정 중 오류가 발생했습니다." };

  revalidateCenterConsumers();
  return { ok: true };
}

export async function deleteCenter(id: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  // FK on delete set null이라 참조 중인 강사 신청서·프로필은 자동으로 center_id가 비워짐("None").
  const admin = createAdminClient();
  const { error } = await admin.from("centers").delete().eq("id", id);
  if (error) return { ok: false, error: "삭제 중 오류가 발생했습니다." };

  revalidateCenterConsumers();
  return { ok: true };
}

/* ===== 강사 삭제 ===== */

// 강사 계정 전체 삭제 (teacher-requests "현재 강사" 목록에서 호출). 되돌리기(→student)는 데이터가 지저분해져 폐지.
// auth 계정 삭제 → FK cascade로 profiles·teacher_applications·teacher_availability·reading_progress 일괄 제거.
// applications(상담신청)은 on delete set null이라 익명 리드로 보존. 아바타 Storage 파일은 cascade 비대상이라 명시 정리.
export async function deleteTeacher(userId: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  if (!userId) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();

  // admin 계정 삭제 방지 (방어).
  const { data: current } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
  if ((current as { role?: string } | null)?.role === "admin") {
    return { ok: false, error: "관리자 계정은 삭제할 수 없습니다." };
  }

  // 아바타 Storage 정리 (best-effort) — cascade 비대상이라 명시 삭제.
  try {
    const { data: files } = await admin.storage.from("avatars").list(userId);
    const paths = (files ?? []).map((f) => `${userId}/${f.name}`);
    if (paths.length > 0) await admin.storage.from("avatars").remove(paths);
  } catch (err) {
    console.error("[deleteTeacher] 아바타 정리 실패:", err);
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: "강사 삭제 중 오류가 발생했습니다." };

  revalidatePath("/admin/teacher-requests");
  revalidatePath("/teacher", "layout");
  return { ok: true };
}

/* ===== 수강신청 관리 ===== */

// 관리자 강제 취소 — 상태 '신청'/'승인'/'결제대기'일 때만. 성공 시 학생에게 SMS 통보(best-effort).
// 슬롯은 동적 차감이라('승인'·'결제대기'가 강사 가용 소비) 취소 즉시 자동 해제.
export async function adminCancelEnrollment(id: string, note: string): Promise<ActionResult> {
  const adminId = await requireAdmin();
  if (!adminId) return { ok: false, error: "권한이 없습니다." };
  const enrollmentId = String(id ?? "").trim();
  const reason = String(note ?? "").trim();
  if (!enrollmentId) return { ok: false, error: "잘못된 요청입니다." };
  if (!reason) return { ok: false, error: "취소 사유를 입력해 주세요." };

  const admin = createAdminClient();
  const { data: enr } = await admin
    .from("enrollments")
    .select("status, student_phone, course, course_title, student_name, teacher_name")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (!enr) return { ok: false, error: "신청을 찾을 수 없습니다." };
  if (enr.status !== "신청" && enr.status !== "승인" && enr.status !== "결제대기") return { ok: false, error: "취소할 수 없는 상태입니다." };

  const { data, error } = await admin
    .from("enrollments")
    .update({ status: "취소", teacher_note: `[관리자] ${reason}`.slice(0, 1000) })
    .eq("id", enrollmentId)
    .in("status", ["신청", "승인", "결제대기"])
    .select("id");
  if (error) return { ok: false, error: "취소 처리 중 오류가 발생했습니다." };
  if (!data || data.length === 0) return { ok: false, error: "이미 처리된 신청입니다." };

  // 학생 결과 SMS (best-effort).
  if (enr.student_phone) {
    try {
      await sendSms(enr.student_phone, `[프렌딩 스쿨] 수강신청이 취소되었습니다. ${enr.course_title}. 사유: ${reason}`);
    } catch (err) {
      console.error("[adminCancelEnrollment] SMS 발송 실패:", err);
    }
  }

  await logEnrollmentEvent(admin, {
    enrollmentId,
    eventType: "enrollment_cancelled",
    actorId: adminId,
    actorRole: "admin",
    course: enr.course,
    courseTitle: enr.course_title,
    studentName: enr.student_name,
    teacherName: enr.teacher_name,
    detail: { reason, fromStatus: enr.status },
  });

  revalidatePath("/admin/enrollments");
  revalidatePath("/admin/classes");
  revalidatePath("/teacher", "layout");
  revalidatePath("/mypage", "layout");
  return { ok: true };
}

// 날짜(로컬 Date) → 'YYYY-MM-DD'. enroll-actions의 종료일 포맷과 동일.
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// enrollment에서 날짜별 클래스를 생성(멱등). 결제 확정 시 호출. best-effort — 실패해도 결제 확정은 유지.
type EnrollmentForClasses = {
  id: string;
  student_id: string;
  teacher_id: string;
  course: string;
  course_title: string;
  teacher_name: string | null;
  student_name: string | null;
  student_english_name: string | null;
  slots: unknown;
  start_date: string;
  total_sessions?: number | null;
};
async function generateClassesForEnrollment(admin: ReturnType<typeof createAdminClient>, enr: EnrollmentForClasses): Promise<void> {
  const slots: Slot[] = (Array.isArray(enr.slots) ? enr.slots : []).filter(isValidSlot).map((s) => ({ day: Number(s.day), min: Number(s.min) }));
  if (slots.length === 0) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(enr.start_date)) return;
  const [y, m, d] = enr.start_date.split("-").map(Number);
  const total = enr.total_sessions ?? TOTAL_SESSIONS; // 테스트 enrollment는 자유 횟수, 실 신청은 기본 24.
  const sessions = enumerateLessonSessions(new Date(y, m - 1, d), slots, total);
  if (sessions.length === 0) return;

  const rows = sessions.map((s) => ({
    enrollment_id: enr.id,
    student_id: enr.student_id,
    teacher_id: enr.teacher_id,
    course: enr.course,
    course_title: enr.course_title,
    teacher_name: enr.teacher_name,
    student_name: enr.student_name,
    student_english_name: enr.student_english_name,
    session_no: s.sessionNo,
    session_date: toDateStr(s.date),
    start_min: s.startMin,
    end_min: s.endMin,
  }));
  // 멱등 — 같은 (enrollment_id, session_no)는 중복 생성하지 않음.
  const { error } = await admin.from("classes").upsert(rows, { onConflict: "enrollment_id,session_no", ignoreDuplicates: true });
  if (error) console.error("[generateClassesForEnrollment] 클래스 생성 실패:", error);
}

// 입금 확인(무통장 1단계) — 상태 '결제대기'일 때만 '결제완료'로 전환. 성공 시 클래스 생성 + 학생에게 SMS 통보(best-effort).
// 회사 계좌 입금이라 확인 주체는 admin. (2단계 PortOne 도입 시 PG 웹훅이 동일 전환을 수행.)
export async function confirmPayment(id: string): Promise<ActionResult> {
  const adminId = await requireAdmin();
  if (!adminId) return { ok: false, error: "권한이 없습니다." };
  const enrollmentId = String(id ?? "").trim();
  if (!enrollmentId) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data: enr } = await admin
    .from("enrollments")
    .select("status, student_phone, course_title, start_date, id, student_id, teacher_id, course, teacher_name, student_name, student_english_name, slots, total_sessions")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (!enr) return { ok: false, error: "신청을 찾을 수 없습니다." };
  if (enr.status !== "결제대기") return { ok: false, error: "결제 대기 상태에서만 확인할 수 있습니다." };

  const { data, error } = await admin
    .from("enrollments")
    .update({ status: "결제완료" })
    .eq("id", enrollmentId)
    .eq("status", "결제대기")
    .select("id");
  if (error) return { ok: false, error: "결제 확인 처리 중 오류가 발생했습니다." };
  if (!data || data.length === 0) return { ok: false, error: "이미 처리된 신청입니다." };

  // 날짜별 클래스 생성 (best-effort, 멱등) — 실패해도 결제 확정은 유지.
  try {
    await generateClassesForEnrollment(admin, enr as EnrollmentForClasses);
  } catch (err) {
    console.error("[confirmPayment] 클래스 생성 실패:", err);
  }

  // 학생 결과 SMS (best-effort).
  if (enr.student_phone) {
    try {
      await sendSms(
        enr.student_phone,
        `[프렌딩 스쿨] 결제가 확인되어 수업이 확정되었습니다. ${enr.course_title} · 시작 ${enr.start_date}. 자세한 내용은 마이페이지(내 강의실)에서 확인하세요.`,
      );
    } catch (err) {
      console.error("[confirmPayment] SMS 발송 실패:", err);
    }
  }

  // 강사 결제 확정 알림 메일(best-effort) — 수업이 생성되어 My Classroom에 잡히므로 강사에게 통보. 실패해도 결제 확정은 유지.
  try {
    const origin = getOrigin(await headers());
    const sessions = enr.total_sessions ?? TOTAL_SESSIONS;
    const endDate = (() => {
      const [sy, sm, sd] = String(enr.start_date ?? "").split("-").map(Number);
      if (!sy || !sm || !sd) return "";
      const endObj = lessonEndDate(new Date(sy, sm - 1, sd), (enr.slots as Slot[]) ?? [], sessions);
      return endObj
        ? `${endObj.getFullYear()}-${String(endObj.getMonth() + 1).padStart(2, "0")}-${String(endObj.getDate()).padStart(2, "0")}`
        : "";
    })();
    const { data: teacherUser } = await admin.auth.admin.getUserById(enr.teacher_id);
    const teacherEmail = teacherUser?.user?.email;
    if (teacherEmail) {
      await sendEnrollmentPaymentConfirmedToTeacher([teacherEmail], {
        studentName: enr.student_name,
        courseTitle: enr.course_title,
        schedule: summarizeSlots((enr.slots as Slot[]) ?? [], false),
        startDate: enr.start_date,
        teacherUrl: `${origin}/teacher`,
        studentEnglishName: enr.student_english_name ?? "",
        courseEnglishTitle: getCourse(enr.course)?.englishTitle,
        endDate,
        totalSessions: sessions,
      });
    }
  } catch (err) {
    console.error("[confirmPayment] 강사 알림 발송 실패:", err);
  }

  await logEnrollmentEvent(admin, {
    enrollmentId,
    eventType: "payment_confirmed",
    actorId: adminId,
    actorRole: "admin",
    course: enr.course,
    courseTitle: enr.course_title,
    studentName: enr.student_name,
    teacherName: enr.teacher_name,
    detail: { sessionsGenerated: enr.total_sessions ?? TOTAL_SESSIONS, startDate: enr.start_date },
  });

  revalidatePath("/admin/enrollments");
  revalidatePath("/admin/classes");
  revalidatePath("/teacher", "layout");
  revalidatePath("/mypage", "layout");
  return { ok: true };
}

/* ===== 화상수업(클래스) 관리 ===== */

// admin이 조회·관리하는 클래스 행에 필요한 필드(액션 내부 로드용).
const CLASS_MANAGE_SELECT =
  "id, enrollment_id, student_id, teacher_id, course, course_title, teacher_name, student_name, student_english_name, session_no, session_date, start_min, end_min, status, is_makeup, conducted_at, conducted_override";

// 수업 진행 여부 수동 보정(admin) — 종료된 수업만. override: true=강제 진행됨 / false=강제 미진행 / null=자동 판정 복귀.
// conducted_at(자동 신호)은 건드리지 않고 conducted_override로 위에 얹는다. 유효값=override ?? (conducted_at!=null).
export async function adminSetClassConducted(classId: string, override: boolean | null): Promise<ActionResult> {
  const adminId = await requireAdmin();
  if (!adminId) return { ok: false, error: "권한이 없습니다." };
  const id = String(classId ?? "").trim();
  if (!id) return { ok: false, error: "잘못된 요청입니다." };
  if (override !== true && override !== false && override !== null) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data: cls } = await admin
    .from("classes")
    .select("id, enrollment_id, course, course_title, student_name, teacher_name, session_no, session_date, start_min, end_min, status")
    .eq("id", id)
    .maybeSingle();
  if (!cls) return { ok: false, error: "수업을 찾을 수 없습니다." };
  if (cls.status === "취소") return { ok: false, error: "취소된 수업은 진행 여부를 지정할 수 없습니다." };
  if (Date.now() < kstDateMinToMs(cls.session_date, lessonEndMin(cls.end_min))) {
    return { ok: false, error: "수업이 종료된 후에만 진행 여부를 지정할 수 있습니다." };
  }

  const { error: updErr } = await admin.from("classes").update({ conducted_override: override }).eq("id", id);
  if (updErr) return { ok: false, error: "진행 여부 저장 중 오류가 발생했습니다." };

  await logEnrollmentEvent(admin, {
    enrollmentId: cls.enrollment_id,
    classId: cls.id,
    eventType: "conducted_overridden",
    actorId: adminId,
    actorRole: "admin",
    course: cls.course,
    courseTitle: cls.course_title,
    studentName: cls.student_name,
    teacherName: cls.teacher_name,
    detail: { sessionNo: cls.session_no, sessionDate: cls.session_date, override },
  });

  revalidatePath("/admin/classes");
  revalidatePath(`/admin/classes/${cls.enrollment_id}`);
  revalidatePath("/admin/settlements");
  revalidatePath("/teacher", "layout");
  revalidatePath("/mypage", "layout");
  return { ok: true };
}

// 개별 수업 강제 취소/연기(admin) — 상태 '예정'만. 사유별 분기:
//   'student' 수강생 요구 연기(보강 O, 남은 연기 차감), 'company' 회사 사유 연기(보강 O, 차감 없음), 'cancel' 수업 취소(보강 X).
// 학생 취소와 달리 6회 한도·시작 1시간 컷오프 미적용(admin 재량 — 차감은 cancel_reason='student' 집계로 자연 반영). 강사 알림 이메일 best-effort.
export async function adminCancelClass(classId: string, reason: "student" | "company" | "cancel"): Promise<ActionResult> {
  const adminId = await requireAdmin();
  if (!adminId) return { ok: false, error: "권한이 없습니다." };
  const id = String(classId ?? "").trim();
  if (!id) return { ok: false, error: "잘못된 요청입니다." };
  if (reason !== "student" && reason !== "company" && reason !== "cancel") return { ok: false, error: "잘못된 요청입니다." };
  const generateMakeup = reason !== "cancel";

  const admin = createAdminClient();
  const { data: cls } = await admin.from("classes").select(CLASS_MANAGE_SELECT).eq("id", id).maybeSingle();
  if (!cls) return { ok: false, error: "수업을 찾을 수 없습니다." };
  if (cls.status !== "예정") return { ok: false, error: "예정 상태의 수업만 취소할 수 있습니다." };
  // 유효 진행여부='진행됨'이면 거부(종료-미진행은 통과, 미래 예정은 conducted 없어 통과).
  if ((cls.conducted_override ?? !!cls.conducted_at) === true) return { ok: false, error: "진행 완료된 수업은 연기·취소할 수 없습니다." };

  const { data: updated, error: updErr } = await admin
    .from("classes")
    .update({ status: "취소", cancel_reason: reason })
    .eq("id", id)
    .eq("status", "예정")
    .select("id");
  if (updErr) return { ok: false, error: "취소 처리 중 오류가 발생했습니다." };
  if (!updated || updated.length === 0) return { ok: false, error: "이미 처리된 수업입니다." };

  // 보강 자동 생성(연기 모드만, best-effort).
  let makeupDate: string | undefined;
  if (generateMakeup) makeupDate = await createMakeupClass(admin, cls as ClassForMakeup);

  // 강사 알림 이메일(best-effort) — 학생 취소와 동일 메일러.
  try {
    const { data: teacherUser } = await admin.auth.admin.getUserById(cls.teacher_id);
    const teacherEmail = teacherUser?.user?.email;
    if (teacherEmail) {
      const lessonEnd = cls.end_min - (SLOT_MIN - LESSON_MIN);
      await sendClassCancellationToTeacher([teacherEmail], {
        studentName: cls.student_english_name || cls.student_name || "Student",
        courseTitle: cls.course_title,
        sessionDate: cls.session_date,
        sessionTime: `${fmtTime(cls.start_min)}~${fmtTime(lessonEnd)}`,
        makeupDate,
      });
    }
  } catch (err) {
    console.error("[adminCancelClass] 강사 알림 발송 실패:", err);
  }

  await logEnrollmentEvent(admin, {
    enrollmentId: cls.enrollment_id,
    classId: cls.id,
    eventType: reason === "cancel" ? "class_cancelled" : "class_postponed",
    actorId: adminId,
    actorRole: "admin",
    course: cls.course,
    courseTitle: cls.course_title,
    studentName: cls.student_name,
    teacherName: cls.teacher_name,
    detail: { reason, sessionNo: cls.session_no, sessionDate: cls.session_date, makeupDate: makeupDate ?? null },
  });

  revalidatePath("/admin/classes");
  revalidatePath(`/admin/classes/${cls.enrollment_id}`);
  revalidatePath("/teacher", "layout");
  revalidatePath("/mypage", "layout");
  return { ok: true };
}

// 개별 수업 강사 강제 대체(admin) — 상태 '예정'만. 강사 사정으로 특정 회차를 다른 강사로 교체.
// 새 강사가 그 요일·시간에 주간 가용이 있고, 같은 날짜에 시간이 겹치는 다른 예정 수업이 없을 때만 허용.
// teacher_id/teacher_name만 교체(시간·학생 불변) — 입장 시 zoom은 teacher_id로 실시간 조회되므로 새 강사로 라우팅됨.
export async function adminReassignClass(classId: string, newTeacherId: string): Promise<ActionResult> {
  const adminId = await requireAdmin();
  if (!adminId) return { ok: false, error: "권한이 없습니다." };
  const id = String(classId ?? "").trim();
  const teacherId = String(newTeacherId ?? "").trim();
  if (!id || !teacherId) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data: cls } = await admin.from("classes").select(CLASS_MANAGE_SELECT).eq("id", id).maybeSingle();
  if (!cls) return { ok: false, error: "수업을 찾을 수 없습니다." };
  if (cls.status !== "예정") return { ok: false, error: "예정 상태의 수업만 강사를 변경할 수 있습니다." };
  // 시작 시각 지난 회차는 대체 불가 — 진행 중/지난 수업은 강사가 바뀔 여지가 없음(노쇼 사후 처리는 연기/취소로).
  if (Date.now() >= kstDateMinToMs(cls.session_date, cls.start_min)) {
    return { ok: false, error: "이미 시작된 수업은 강사를 변경할 수 없습니다." };
  }
  if (cls.teacher_id === teacherId) return { ok: false, error: "현재 강사와 다른 강사를 선택해 주세요." };

  // 새 강사 검증 — role='teacher' + 표시명.
  const { data: prof } = await admin.from("profiles").select("first_name, last_name, role").eq("id", teacherId).maybeSingle();
  if (!prof || prof.role !== "teacher") return { ok: false, error: "유효한 강사가 아닙니다." };
  const newName = [prof.first_name, prof.last_name].filter(Boolean).join(" ").trim() || "강사";

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
    .update({ teacher_id: teacherId, teacher_name: newName, teacher_reassigned_at: new Date().toISOString() })
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
    console.error("[adminReassignClass] 학생 SMS 발송 실패:", err);
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
    console.error("[adminReassignClass] 강사 알림 발송 실패:", err);
  }

  await logEnrollmentEvent(admin, {
    enrollmentId: cls.enrollment_id,
    classId: cls.id,
    eventType: "class_reassigned",
    actorId: adminId,
    actorRole: "admin",
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
  return { ok: true };
}

// 남은 수업 전체 주간 일정 일괄 변경(admin) — 담당 강사 유지, 요일·시간만.
// 남은='예정'이고 레슨 종료 시각이 아직 안 지난 미래 클래스. 과거·완료·취소는 그대로.
// 남은 회차를 session_no 오름차순으로 enumerateLessonSessions(effectiveDate,newSlots,remaining)에 1:1 remap(행 id·회차 유지).
export async function adminRescheduleRemaining(enrollmentId: string, slots: Slot[], effectiveDate: string): Promise<ActionResult> {
  const adminId = await requireAdmin();
  if (!adminId) return { ok: false, error: "권한이 없습니다." };
  const id = String(enrollmentId ?? "").trim();
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  // 입력 검증 — 새 슬롯 정규화(중복 제거) + 적용 시작일.
  const seen = new Set<string>();
  const newSlots: Slot[] = (Array.isArray(slots) ? slots : []).filter(isValidSlot).reduce<Slot[]>((acc, s) => {
    const day = Number(s.day);
    const min = Number(s.min);
    const key = `${day}-${min}`;
    if (!seen.has(key)) {
      seen.add(key);
      acc.push({ day, min });
    }
    return acc;
  }, []);
  if (newSlots.length === 0) return { ok: false, error: "새 수업 요일과 시간을 선택해 주세요." };
  if (newSlots.length > 7 * 36) return { ok: false, error: "선택한 시간이 너무 많습니다." };
  const effective = String(effectiveDate ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effective)) return { ok: false, error: "적용 시작일을 선택해 주세요." };
  // 적용 시작일은 내일 이후만 — 오늘 배치 시 과거 시각·같은 날 중복 등 혼선 방지.
  if (effective <= todayKst()) return { ok: false, error: "적용 시작일은 내일 이후여야 합니다." };
  // 상한: 오늘부터 일주일 이내 — 남은 일정을 과도하게 먼 미래로 미는 실수 방지.
  if (effective > addDaysStr(todayKst(), 7)) return { ok: false, error: "적용 시작일은 오늘부터 일주일 이내여야 합니다." };

  const admin = createAdminClient();
  const { data: enr } = await admin
    .from("enrollments")
    .select("id, teacher_id, student_id, status, course, course_title, student_name, teacher_name, slots")
    .eq("id", id)
    .maybeSingle();
  if (!enr) return { ok: false, error: "수강신청을 찾을 수 없습니다." };
  const oldSlots = enr.slots;

  // 남은(미래 '예정') 클래스 — session_no 오름차순.
  const { data: clsRows } = await admin
    .from("classes")
    .select("id, session_no, session_date, start_min, end_min, status")
    .eq("enrollment_id", id)
    .eq("status", "예정")
    .order("session_no", { ascending: true });
  const now = Date.now();
  const remaining = ((clsRows ?? []) as { id: string; session_no: number; session_date: string; start_min: number; end_min: number }[]).filter(
    (c) => kstDateMinToMs(c.session_date, lessonEndMin(c.end_min)) >= now,
  );
  if (remaining.length === 0) return { ok: false, error: "변경할 남은 수업이 없습니다." };

  // 강사 주간 가용 검증 — 새 슬롯 전체가 강사 가용 안에 있어야 함.
  const { data: slotRows } = await admin.from("teacher_availability").select("day_of_week, start_min").eq("teacher_id", enr.teacher_id);
  const teacherSlots: Slot[] = (slotRows ?? []).map((r: { day_of_week: number; start_min: number }) => ({ day: r.day_of_week, min: r.start_min }));
  if (!teacherHasAllSlots(teacherSlots, newSlots)) {
    return { ok: false, error: "강사의 주간 가용시간이 아닙니다. 다른 요일·시간을 선택해 주세요." };
  }

  // 새 날짜/시간 열거 — remaining.length개.
  const [ey, em, ed] = effective.split("-").map(Number);
  const sessions = enumerateLessonSessions(new Date(ey, em - 1, ed), newSlots, remaining.length);
  if (sessions.length !== remaining.length) return { ok: false, error: "새 일정을 계산할 수 없습니다. 다른 요일·시간을 선택해 주세요." };

  // 충돌 검증 — 이 강사·학생의 '다른' enrollment의 '예정' 클래스와 시간 겹침 차단.
  const { data: otherRows } = await admin
    .from("classes")
    .select("teacher_id, student_id, session_date, start_min, end_min, status")
    .in("status", ["예정"])
    .neq("enrollment_id", id);
  const others = ((otherRows ?? []) as { teacher_id: string; student_id: string; session_date: string; start_min: number; end_min: number }[]).filter(
    (o) => o.teacher_id === enr.teacher_id || o.student_id === enr.student_id,
  );
  for (const s of sessions) {
    const dateStr = toDateStr(s.date);
    const clash = others.find((o) => o.session_date === dateStr && s.startMin < o.end_min && o.start_min < s.endMin);
    if (clash) return { ok: false, error: `${dateStr} ${fmtTime(s.startMin)}에 강사 또는 학생의 다른 수업이 있습니다. 다른 일정을 선택해 주세요.` };
  }

  // 적용 — 남은 클래스[i] ↔ sessions[i] remap(회차·id 유지).
  const results = await Promise.all(
    remaining.map((c, i) =>
      admin
        .from("classes")
        .update({ session_date: toDateStr(sessions[i].date), start_min: sessions[i].startMin, end_min: sessions[i].endMin })
        .eq("id", c.id)
        .eq("status", "예정")
        .select("id"),
    ),
  );
  if (results.some((r) => r.error)) return { ok: false, error: "일정 변경 처리 중 일부 오류가 발생했습니다. 목록을 새로고침해 확인해 주세요." };

  // 향후 주간 패턴 반영(가용 차감·요약·종료일 폴백).
  await admin.from("enrollments").update({ slots: newSlots }).eq("id", id);

  await logEnrollmentEvent(admin, {
    enrollmentId: id,
    eventType: "remaining_rescheduled",
    actorId: adminId,
    actorRole: "admin",
    course: enr.course,
    courseTitle: enr.course_title,
    studentName: enr.student_name,
    teacherName: enr.teacher_name,
    detail: { effectiveDate: effective, affectedCount: remaining.length, oldSlots, newSlots },
  });

  revalidatePath("/admin/classes");
  revalidatePath(`/admin/classes/${id}`);
  revalidatePath("/admin/enrollments");
  revalidatePath("/teacher", "layout");
  revalidatePath("/mypage", "layout");
  return { ok: true };
}

// 남은 수업 전체 담당 강사 대체(admin) — 강사 중도 하차 시. 담당 강사 교체 + enrollment 이관.
// 남은='예정'이고 레슨 종료 시각이 아직 안 지난 미래 클래스. 과거·완료·취소는 원 강사로 보존.
// effectiveDate(선택): 비면 날짜 유지·강사만 교체. 지정(D+1~D+7)하면 그 날부터 기존 주간 패턴으로 재배치.
// 단일 대타(adminReassignClass)와 달리 enrollment.teacher_id도 새 강사로 이관(가용 차감·대시보드 정합).
export async function adminReassignRemaining(enrollmentId: string, newTeacherId: string, effectiveDate?: string): Promise<ActionResult> {
  const adminId = await requireAdmin();
  if (!adminId) return { ok: false, error: "권한이 없습니다." };
  const id = String(enrollmentId ?? "").trim();
  const teacherId = String(newTeacherId ?? "").trim();
  if (!id || !teacherId) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data: enr } = await admin
    .from("enrollments")
    .select("id, teacher_id, teacher_name, student_id, student_phone, course, course_title, student_name, student_english_name, slots")
    .eq("id", id)
    .maybeSingle();
  if (!enr) return { ok: false, error: "수강신청을 찾을 수 없습니다." };
  if (enr.teacher_id === teacherId) return { ok: false, error: "현재 강사와 다른 강사를 선택해 주세요." };

  // 새 강사 검증 — role='teacher' + 표시명.
  const { data: prof } = await admin.from("profiles").select("first_name, last_name, role").eq("id", teacherId).maybeSingle();
  if (!prof || prof.role !== "teacher") return { ok: false, error: "유효한 강사가 아닙니다." };
  const newName = [prof.first_name, prof.last_name].filter(Boolean).join(" ").trim() || "강사";

  // 남은(미래 '예정') 클래스 — session_no 오름차순.
  const { data: clsRows } = await admin
    .from("classes")
    .select("id, session_no, session_date, start_min, end_min, status")
    .eq("enrollment_id", id)
    .eq("status", "예정")
    .order("session_no", { ascending: true });
  const now = Date.now();
  const remaining = ((clsRows ?? []) as { id: string; session_no: number; session_date: string; start_min: number; end_min: number }[]).filter(
    (c) => kstDateMinToMs(c.session_date, lessonEndMin(c.end_min)) >= now,
  );
  if (remaining.length === 0) return { ok: false, error: "변경할 남은 수업이 없습니다." };

  // 적용 시작일(필수) — 그 날부터 기존 주간 패턴으로 재배치. D+1~D+7.
  const effective = String(effectiveDate ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effective)) return { ok: false, error: "적용 시작일을 선택해 주세요." };
  if (effective <= todayKst()) return { ok: false, error: "적용 시작일은 내일 이후여야 합니다." };
  if (effective > addDaysStr(todayKst(), 7)) return { ok: false, error: "적용 시작일은 오늘부터 일주일 이내여야 합니다." };

  // 주간 패턴 — enrollment.slots 정규화. 비어 있으면(레거시) 남은 클래스 실제 요일·시각으로 폴백.
  const wseen = new Set<string>();
  const weekly: Slot[] = ((enr.slots as Slot[]) ?? []).filter(isValidSlot).reduce<Slot[]>((acc, s) => {
    const day = Number(s.day);
    const min = Number(s.min);
    const key = `${day}-${min}`;
    if (!wseen.has(key)) {
      wseen.add(key);
      acc.push({ day, min });
    }
    return acc;
  }, []);
  if (weekly.length === 0) {
    for (const c of remaining) {
      const day = weekdayOf(c.session_date);
      for (let min = c.start_min; min < c.end_min; min += 30) {
        const key = `${day}-${min}`;
        if (!wseen.has(key)) {
          wseen.add(key);
          weekly.push({ day, min });
        }
      }
    }
  }
  if (weekly.length === 0) return { ok: false, error: "재배치할 주간 일정을 확인할 수 없습니다." };
  const scheduleSlots = weekly;

  // 새 강사 주간 가용 검증 — 남은 수업 전체가 새 강사 가용시간 안에 있어야 함.
  const { data: slotRows } = await admin.from("teacher_availability").select("day_of_week, start_min").eq("teacher_id", teacherId);
  const teacherSlots: Slot[] = (slotRows ?? []).map((r: { day_of_week: number; start_min: number }) => ({ day: r.day_of_week, min: r.start_min }));
  if (!teacherHasAllSlots(teacherSlots, scheduleSlots)) {
    return { ok: false, error: "선택한 강사의 주간 가용시간이 아닙니다. 다른 강사를 선택해 주세요." };
  }

  // 타깃 날짜/시간 — 시작일부터 주간 패턴으로 재배치(회차·id 유지).
  const [ey, em, ed] = effective.split("-").map(Number);
  const sessions = enumerateLessonSessions(new Date(ey, em - 1, ed), weekly, remaining.length);
  if (sessions.length !== remaining.length) return { ok: false, error: "새 일정을 계산할 수 없습니다. 다른 시작일을 선택해 주세요." };
  const targets = remaining.map((c, i) => ({ id: c.id, date: toDateStr(sessions[i].date), startMin: sessions[i].startMin, endMin: sessions[i].endMin }));

  // 충돌 검증 — 새 강사 또는 학생의 '다른' enrollment '예정' 클래스와 타깃 날짜·시간이 겹치면 차단(날짜 이동 시 학생 충돌도 재검증).
  const { data: otherRows } = await admin
    .from("classes")
    .select("teacher_id, student_id, enrollment_id, session_date, start_min, end_min, status")
    .eq("status", "예정")
    .neq("enrollment_id", id);
  const others = ((otherRows ?? []) as { teacher_id: string; student_id: string; session_date: string; start_min: number; end_min: number }[]).filter(
    (o) => o.teacher_id === teacherId || o.student_id === enr.student_id,
  );
  for (const t of targets) {
    const clash = others.find((o) => o.session_date === t.date && t.startMin < o.end_min && o.start_min < t.endMin);
    if (clash) {
      return { ok: false, error: `${t.date} ${fmtTime(t.startMin)}에 선택한 강사 또는 학생의 다른 예정 수업이 있습니다. 다른 강사·시작일을 선택해 주세요.` };
    }
  }

  const oldTeacherId = enr.teacher_id;
  // 적용 — 담당 강사 교체 + 타깃 날짜/시간(원자 가드). 날짜 유지 경로는 기존값과 동일해 무해.
  const reassignedAt = new Date().toISOString();
  const results = await Promise.all(
    targets.map((t) =>
      admin
        .from("classes")
        .update({ teacher_id: teacherId, teacher_name: newName, session_date: t.date, start_min: t.startMin, end_min: t.endMin, teacher_reassigned_at: reassignedAt })
        .eq("id", t.id)
        .eq("status", "예정")
        .select("id"),
    ),
  );
  if (results.some((r) => r.error)) return { ok: false, error: "강사 변경 처리 중 일부 오류가 발생했습니다. 목록을 새로고침해 확인해 주세요." };

  // enrollment 이관 — 가용 차감·강사 대시보드·강의실 노출 정합. slots(주간 패턴)는 불변.
  await admin.from("enrollments").update({ teacher_id: teacherId, teacher_name: newName }).eq("id", id);

  const schedule = summarizeSlots(scheduleSlots, false);
  const nextDate = targets[0].date;

  // 학생 결과 SMS (best-effort).
  try {
    if (enr.student_phone) {
      await sendSms(
        enr.student_phone,
        `[프렌딩 스쿨] ${enr.course_title} 과정의 담당 강사가 ${newName} 강사로 변경되었습니다. 남은 ${remaining.length}회 수업이 ${nextDate}부터 새 일정으로 재배치되었습니다. 자세한 내용은 마이페이지(내 강의실)에서 확인하세요.`,
      );
    }
  } catch (err) {
    console.error("[adminReassignRemaining] 학생 SMS 발송 실패:", err);
  }

  // 강사 알림 메일 (best-effort) — 새 강사(배정)·기존 강사(이관).
  try {
    const origin = getOrigin(await headers());
    const base = {
      studentName: enr.student_english_name || enr.student_name || "Student",
      courseTitle: getCourse(enr.course)?.englishTitle || enr.course_title,
      schedule,
      remainingCount: remaining.length,
      nextDate,
      oldTeacherName: enr.teacher_name ?? undefined,
      newTeacherName: newName,
      teacherUrl: `${origin}/teacher`,
    };
    const { data: newUser } = await admin.auth.admin.getUserById(teacherId);
    const newEmail = newUser?.user?.email;
    if (newEmail) await sendCourseReassignToNewTeacher([newEmail], base);
    const { data: oldUser } = await admin.auth.admin.getUserById(oldTeacherId);
    const oldEmail = oldUser?.user?.email;
    if (oldEmail) await sendCourseReassignToOldTeacher([oldEmail], base);
  } catch (err) {
    console.error("[adminReassignRemaining] 강사 알림 발송 실패:", err);
  }

  await logEnrollmentEvent(admin, {
    enrollmentId: id,
    eventType: "remaining_reassigned",
    actorId: adminId,
    actorRole: "admin",
    course: enr.course,
    courseTitle: enr.course_title,
    studentName: enr.student_name,
    teacherName: newName,
    detail: {
      effectiveDate: effective,
      affectedCount: remaining.length,
      nextDate,
      oldTeacher: { id: oldTeacherId, name: enr.teacher_name },
      newTeacher: { id: teacherId, name: newName },
    },
  });

  revalidatePath("/admin/classes");
  revalidatePath(`/admin/classes/${id}`);
  revalidatePath("/admin/enrollments");
  revalidatePath("/teacher", "layout");
  revalidatePath("/mypage", "layout");
  return { ok: true };
}

/* ===== 테스트 수강신청(개발용) ===== */

// 이메일 → user id (페이지네이션). 못 찾으면 null.
async function findUserIdByEmail(admin: ReturnType<typeof createAdminClient>, email: string): Promise<string | null> {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data) return null;
    const users = data.users as Array<{ id: string; email?: string | null }>;
    const hit = users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (hit) return hit.id;
    if (users.length < 1000) break;
  }
  return null;
}

// 관리자 전용 테스트 수강신청 생성 — 실 동선과 동일하게 '신청' 상태로 들어가되, 시작일 D+3/D+14·폰·영문 가드를 우회하고
// 수업 횟수를 자유 입력(total_sessions). is_test=true로 표시. 이후 승인/결제확인은 일반 흐름과 동일.
export async function createTestEnrollment(input: {
  studentEmail?: string;
  teacherId: string;
  course: string;
  slots: Slot[];
  startDate: string;
  sessions: number;
}): Promise<ActionResult> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isAdmin(supabase, user.id))) return { ok: false, error: "권한이 없습니다." };

  const course = getCourse(input.course);
  if (!course) return { ok: false, error: "잘못된 과정입니다." };
  const teacherId = String(input.teacherId ?? "").trim();
  if (!teacherId) return { ok: false, error: "강사를 선택해 주세요." };
  const slots: Slot[] = (Array.isArray(input.slots) ? input.slots : []).filter(isValidSlot).map((s) => ({ day: Number(s.day), min: Number(s.min) }));
  if (slots.length === 0) return { ok: false, error: "수업 일정을 선택해 주세요." };
  const startDate = String(input.startDate ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return { ok: false, error: "시작일 형식이 올바르지 않습니다." };
  const sessions = Number(input.sessions);
  if (!Number.isInteger(sessions) || sessions < 1 || sessions > 60) return { ok: false, error: "수업 횟수는 1~60 사이여야 합니다." };

  const admin = createAdminClient();

  // 강사 검증 + 이름 스냅샷.
  const { data: teacher } = await admin.from("profiles").select("id, role, first_name, last_name").eq("id", teacherId).maybeSingle();
  if (!teacher || teacher.role !== "teacher") return { ok: false, error: "선택한 강사를 찾을 수 없습니다." };
  const teacherName = [teacher.first_name, teacher.last_name].filter(Boolean).join(" ").trim() || "강사";

  // 학생 resolve — 이메일 지정 시 그 계정, 아니면 호출 admin 본인.
  let studentId = user.id;
  const email = String(input.studentEmail ?? "")
    .trim()
    .toLowerCase();
  if (email) {
    const found = await findUserIdByEmail(admin, email);
    if (!found) return { ok: false, error: "학생 이메일에 해당하는 계정을 찾을 수 없습니다." };
    studentId = found;
  }

  // 학생 스냅샷(없어도 허용 — 테스트 우회). 한국 관례 성+이름 붙임.
  const { data: student } = await admin.from("profiles").select("first_name, last_name, english_name, phone").eq("id", studentId).maybeSingle();
  const studentName = student ? [student.last_name, student.first_name].filter(Boolean).join("").trim() || null : null;

  const { data: inserted, error: insErr } = await admin
    .from("enrollments")
    .insert({
      student_id: studentId,
      teacher_id: teacherId,
      course: course.slug,
      course_title: course.title,
      start_date: startDate,
      slots,
      teacher_name: teacherName,
      student_name: studentName,
      student_english_name: student?.english_name ?? null,
      student_phone: student?.phone ?? null,
      total_sessions: sessions,
      is_test: true,
    })
    .select("id")
    .maybeSingle();
  if (insErr) return { ok: false, error: "테스트 수강신청 생성 중 오류가 발생했습니다." };

  await logEnrollmentEvent(admin, {
    enrollmentId: inserted?.id ?? null,
    eventType: "enrollment_created",
    actorId: user.id,
    actorRole: "admin",
    course: course.slug,
    courseTitle: course.title,
    studentName,
    teacherName,
    detail: { isTest: true, totalSessions: sessions, startDate, slots },
  });

  revalidatePath("/admin/enrollments");
  return { ok: true };
}

// 테스트 수강신청 삭제(정리용) — is_test=true인 행만 하드 삭제(FK cascade로 classes 동반 제거).
export async function deleteTestEnrollment(id: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  const enrollmentId = String(id ?? "").trim();
  if (!enrollmentId) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data: enr } = await admin.from("enrollments").select("id, is_test").eq("id", enrollmentId).maybeSingle();
  if (!enr) return { ok: false, error: "수강신청을 찾을 수 없습니다." };
  if (!enr.is_test) return { ok: false, error: "테스트 수강신청만 삭제할 수 있습니다." };

  const { error } = await admin.from("enrollments").delete().eq("id", enrollmentId).eq("is_test", true);
  if (error) return { ok: false, error: "삭제 중 오류가 발생했습니다." };

  revalidatePath("/admin/enrollments");
  revalidatePath("/admin/classes");
  revalidatePath("/teacher", "layout");
  revalidatePath("/mypage", "layout");
  return { ok: true };
}

/* ===== 강사 지원 관리 ===== */

// 지원자 이메일 + 이름 조회 (알림 메일용). 실패 시 null.
async function getApplicantContact(admin: ReturnType<typeof createAdminClient>, appId: string): Promise<{ email: string; name: string } | null> {
  const { data: app } = await admin.from("teacher_applications").select("user_id, name").eq("id", appId).maybeSingle();
  const row = app as { user_id: string; name: string } | null;
  if (!row) return null;
  const { data: userRes } = await admin.auth.admin.getUserById(row.user_id);
  const email = userRes?.user?.email;
  if (!email) return null;
  return { email, name: row.name ?? "" };
}

// 강사 지원 승인 → RPC로 role 부여 + 프로필 채움 + 상태 '승인'을 원자적으로 처리(상태 가드 포함).
export async function approveTeacherApplication(id: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data: result, error } = await admin.rpc("approve_teacher_application", { p_app_id: id });
  if (error) return { ok: false, error: "승인 처리 중 오류가 발생했습니다." };
  switch (result) {
    case "ok":
      break;
    case "not_found":
      return { ok: false, error: "지원 내역을 찾을 수 없습니다." };
    case "not_pending":
      return { ok: false, error: "이미 처리된 지원입니다. 목록을 새로고침해 주세요." };
    case "is_admin":
      return { ok: false, error: "관리자 계정은 강사로 전환할 수 없습니다." };
    default:
      return { ok: false, error: "승인 처리 중 오류가 발생했습니다." };
  }

  // 지원자 승인 알림 메일 (best-effort) — 실패해도 승인은 유효.
  try {
    const contact = await getApplicantContact(admin, id);
    if (contact) {
      const origin = getOrigin(await headers());
      await sendTeacherApprovalNotification([contact.email], { name: contact.name, teacherUrl: `${origin}/teacher` });
    }
  } catch (err) {
    console.error("[approveTeacherApplication] 승인 알림 발송 실패:", err);
  }

  revalidatePath("/admin/teacher-requests");
  revalidatePath("/teacher", "layout");
  return { ok: true };
}

// 강사 지원 거절 (상태 '거절' + 관리자 메모). 상태 가드: '신청'만 거절 가능. role 변경 없음.
export async function rejectTeacherApplication(id: string, adminNote: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("teacher_applications")
    .update({ status: "거절", admin_note: adminNote || null })
    .eq("id", id)
    .eq("status", "신청")
    .select("id");
  if (error) return { ok: false, error: "저장 중 오류가 발생했습니다." };
  if (!data || data.length === 0) return { ok: false, error: "이미 처리된 지원입니다. 목록을 새로고침해 주세요." };

  // 지원자 거절 알림 메일 (best-effort) — 실패해도 거절은 유효.
  try {
    const contact = await getApplicantContact(admin, id);
    if (contact) {
      const origin = getOrigin(await headers());
      await sendTeacherRejectionNotification([contact.email], { name: contact.name, reason: adminNote || "", applyUrl: `${origin}/teacher/apply` });
    }
  } catch (err) {
    console.error("[rejectTeacherApplication] 거절 알림 발송 실패:", err);
  }

  revalidatePath("/admin/teacher-requests");
  return { ok: true };
}
