"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient, getAdminEmails } from "@/utils/supabase/admin";
import { getUserRole } from "@/lib/auth";
import { isValidZoomUrl } from "@/lib/url";
import { getOrigin } from "@/lib/origin";
import { getCourse } from "@/data/courses";
import { sendSms } from "@/lib/sms";
import { sendEnrollmentApprovedToAdmin, sendEnrollmentRejectedToAdmin } from "@/lib/mailer";
import { isValidSlot, slotsOverlap, summarizeSlots, lessonEndDate, TOTAL_SESSIONS, type Slot } from "@/lib/availability";
import { loadEndedEnrollmentIds } from "@/lib/booking";
import { logEnrollmentEvent } from "@/lib/events";

export type TeacherActionState = { ok?: boolean; error?: string };

// 강사 액션 진입 가드 — 세션으로 role 확인(teacher 또는 admin) 후 userId 반환.
async function requireTeacher(): Promise<string | null> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const role = await getUserRole(supabase, user.id);
  return role === "teacher" || role === "admin" ? user.id : null;
}

// 빈 문자열은 null로 저장, 길이 제한 적용.
function clean(value: FormDataEntryValue | null, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export async function updateTeacherProfile(_prev: TeacherActionState, formData: FormData): Promise<TeacherActionState> {
  const userId = await requireTeacher();
  if (!userId) return { error: "You don't have permission." };

  const bio = clean(formData.get("bio"), 2000);
  const experience = clean(formData.get("experience"), 2000);
  const phone = clean(formData.get("phone"), 30);
  const zoomUrl = clean(formData.get("zoom_url"), 500);

  // 이름·국적·성별·센터는 강사가 수정 불가(승인 시 확정, 변경은 admin만) — 서버에서 읽지도·갱신하지도 않음.
  // 전화번호를 제외한 나머지는 필수 (clean()이 공백-only를 null로 만들어 우회 차단).
  if (!bio || !experience || !zoomUrl) {
    return { error: "Please fill in all required fields." };
  }

  if (!isValidZoomUrl(zoomUrl)) {
    return { error: "Invalid Zoom URL. (must start with http:// or https://)" };
  }

  // service_role로 본인 row의 화이트리스트 컬럼만 갱신 (name/nationality/gender/center_id/role 등은 제외).
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ bio, experience, phone, zoom_url: zoomUrl }).eq("id", userId);
  if (error) return { error: "Something went wrong while saving." };

  revalidatePath("/teacher", "layout");
  return { ok: true };
}

export type AvailabilitySlot = { day: number; min: number };

// 강사 주간 가용 시간 저장 — 편집은 전체 그리드 교체(delete 후 bulk insert).
// 슬롯은 { day: 0~6(0=일), min: 자정 기준 분(30의 배수) } 배열. service_role로 본인 row만 갱신.
export async function updateTeacherAvailability(slots: AvailabilitySlot[]): Promise<TeacherActionState> {
  const userId = await requireTeacher();
  if (!userId) return { error: "You don't have permission." };
  if (!Array.isArray(slots) || slots.length > 7 * 48) return { error: "Invalid request." };

  // 검증 + 중복 제거(key "day-min").
  const seen = new Set<string>();
  const rows: { teacher_id: string; day_of_week: number; start_min: number }[] = [];
  for (const s of slots) {
    const day = Number(s?.day);
    const min = Number(s?.min);
    if (!Number.isInteger(day) || day < 0 || day > 6) return { error: "Invalid request." };
    if (!Number.isInteger(min) || min < 0 || min > 1439 || min % 30 !== 0) return { error: "Invalid request." };
    const key = `${day}-${min}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ teacher_id: userId, day_of_week: day, start_min: min });
  }

  const admin = createAdminClient();
  // 1) 본인 슬롯 전체 삭제.
  const { error: delErr } = await admin.from("teacher_availability").delete().eq("teacher_id", userId);
  if (delErr) return { error: "Something went wrong while saving." };
  // 2) 빈 선택이면 여기서 종료(전부 비움).
  if (rows.length === 0) {
    revalidatePath("/teacher", "layout");
    return { ok: true };
  }
  // 3) bulk insert.
  const { error: insErr } = await admin.from("teacher_availability").insert(rows);
  if (insErr) return { error: "Something went wrong while saving." };

  revalidatePath("/teacher", "layout");
  return { ok: true };
}

/* ===== 수강신청 승인/거절 (강사 대시보드) ===== */

// 본인에게 온 '신청' 상태 수강신청을 로드(소유권 가드). 처리 대상이 아니면 null.
async function loadOwnPendingEnrollment(admin: ReturnType<typeof createAdminClient>, enrollmentId: string, teacherId: string) {
  const { data } = await admin
    .from("enrollments")
    .select(
      "id, teacher_id, status, student_phone, student_name, student_english_name, course, course_title, course_english_title, teacher_name, slots, total_sessions, start_date",
    )
    .eq("id", enrollmentId)
    .maybeSingle();
  if (!data || data.teacher_id !== teacherId) return null;
  return data as {
    id: string;
    teacher_id: string;
    status: string;
    student_phone: string | null;
    student_name: string | null;
    student_english_name: string | null;
    course: string;
    course_title: string;
    teacher_name: string | null;
    slots: unknown;
    total_sessions: number | null;
    start_date: string;
  };
}

// enrollment 스냅샷에서 관리자 알림 메일 데이터를 조립(승인/거절 공용). endDate는 승인 시에만 계산.
function buildAdminEnrollmentEmail(
  enr: {
    student_name: string | null;
    student_english_name: string | null;
    course: string;
    course_title: string;
    course_english_title?: string | null;
    teacher_name: string | null;
    slots: unknown;
    total_sessions: number | null;
    start_date: string;
  },
  origin: string,
  opts: { withEnd?: boolean; reason?: string },
) {
  const slots: Slot[] = Array.isArray(enr.slots) ? enr.slots.filter(isValidSlot).map((s) => ({ day: Number(s.day), min: Number(s.min) })) : [];
  const totalSessions = enr.total_sessions ?? TOTAL_SESSIONS;
  const endDate = (() => {
    if (!opts.withEnd) return "";
    const [sy, sm, sd] = String(enr.start_date ?? "").split("-").map(Number);
    if (!sy || !sm || !sd) return "";
    const endObj = lessonEndDate(new Date(sy, sm - 1, sd), slots, totalSessions);
    return endObj ? `${endObj.getFullYear()}-${String(endObj.getMonth() + 1).padStart(2, "0")}-${String(endObj.getDate()).padStart(2, "0")}` : "";
  })();
  return {
    studentName: enr.student_name ?? "",
    studentEnglishName: enr.student_english_name ?? "",
    courseTitle: enr.course_title,
    courseEnglishTitle: getCourse(enr.course)?.englishTitle ?? enr.course_english_title ?? "",
    teacherName: enr.teacher_name ?? "",
    schedule: summarizeSlots(slots, false),
    startDate: enr.start_date,
    endDate,
    totalSessions,
    adminUrl: `${origin}/admin/enrollments`,
    ...(opts.reason ? { reason: opts.reason } : {}),
  };
}

// 수강신청 승인 — 본인 소유 + 상태 '신청'일 때만. 승인 시 곧바로 '결제대기'로 전환. 성공 시 학생에게 SMS 발송(best-effort).
export async function approveEnrollment(enrollmentId: string): Promise<TeacherActionState> {
  const userId = await requireTeacher();
  if (!userId) return { error: "You don't have permission." };

  const admin = createAdminClient();
  const enr = await loadOwnPendingEnrollment(admin, enrollmentId, userId);
  if (!enr) return { error: "신청을 찾을 수 없어요. 목록을 새로고침해 주세요." };
  if (enr.status !== "신청") return { error: "이미 처리된 신청입니다. 목록을 새로고침해 주세요." };

  // 중복 예약 가드: 이 강사의 다른 확정 예약('승인'·'결제대기'·'결제완료')과 시간이 겹치면 승인 차단(race-safe — update 직전 최신 조회).
  // ⚠️ 잔여 race(겹치는 두 건을 거의 동시 승인)는 앱레벨 한계 — 단일 강사 순차 클릭이라 현실 위험 낮음. 향후 DB 제약으로 하드닝 가능.
  const parse = (raw: unknown): Slot[] =>
    Array.isArray(raw) ? raw.filter(isValidSlot).map((s) => ({ day: Number(s.day), min: Number(s.min) })) : [];
  const { data: thisRow } = await admin.from("enrollments").select("slots").eq("id", enrollmentId).maybeSingle();
  const targetSlots = parse(thisRow?.slots);
  const { data: approvedRows } = await admin
    .from("enrollments")
    .select("id, slots, status")
    .eq("teacher_id", userId)
    .in("status", ["승인", "결제대기", "결제완료"])
    .neq("id", enrollmentId);
  // 종료된 '결제완료'(남은 예정 수업 없음)는 충돌 대상에서 제외.
  const ended = await loadEndedEnrollmentIds(admin, [userId]);
  const bookedSlots: Slot[] = (approvedRows ?? [])
    .filter((r: { id: string; status: string }) => !(r.status === "결제완료" && ended.has(r.id)))
    .flatMap((r: { slots: unknown }) => parse(r.slots));
  if (slotsOverlap(targetSlots, bookedSlots)) {
    return { error: "This time slot is already booked by another student. Please decline and suggest a different time." };
  }

  // 상태 가드: '신청'일 때만 '결제대기'로 갱신(동시 처리 방지).
  const { data, error } = await admin.from("enrollments").update({ status: "결제대기" }).eq("id", enrollmentId).eq("status", "신청").select("id");
  if (error) return { error: "처리 중 오류가 발생했어요." };
  if (!data || data.length === 0) return { error: "이미 처리된 신청입니다. 목록을 새로고침해 주세요." };

  // 학생 결과 SMS (best-effort).
  if (enr.student_phone) {
    try {
      await sendSms(
        enr.student_phone,
        `[프렌딩 스쿨] 수강신청이 승인되었습니다(결제 대기). ${enr.course_title} · 시작 ${enr.start_date}. 자세한 내용은 마이페이지에서 확인하세요.`,
      );
    } catch (err) {
      console.error("[approveEnrollment] SMS 발송 실패:", err);
    }
  }

  // 관리자 알림 메일 (best-effort) — 승인=결제대기라 입금 확인 유도. SMS와 독립.
  try {
    const origin = getOrigin(await headers());
    const adminEmails = await getAdminEmails();
    await sendEnrollmentApprovedToAdmin(adminEmails, buildAdminEnrollmentEmail(enr, origin, { withEnd: true }));
  } catch (err) {
    console.error("[approveEnrollment] 관리자 알림 발송 실패:", err);
  }

  await logEnrollmentEvent(admin, {
    enrollmentId,
    eventType: "enrollment_approved",
    actorId: userId,
    actorRole: "teacher",
    course: enr.course,
    courseTitle: enr.course_title,
    studentName: enr.student_name,
    teacherName: enr.teacher_name,
    detail: { from: "신청", to: "결제대기" },
  });

  revalidatePath("/teacher", "layout");
  return { ok: true };
}

// 수강신청 거절 — 사유 필수. 본인 소유 + 상태 '신청'일 때만. 성공 시 학생에게 SMS 발송(best-effort).
export async function rejectEnrollment(enrollmentId: string, note: string): Promise<TeacherActionState> {
  const userId = await requireTeacher();
  if (!userId) return { error: "You don't have permission." };

  const reason = String(note ?? "").trim();
  if (!reason) return { error: "거절 사유를 입력해 주세요." };

  const admin = createAdminClient();
  const enr = await loadOwnPendingEnrollment(admin, enrollmentId, userId);
  if (!enr) return { error: "신청을 찾을 수 없어요. 목록을 새로고침해 주세요." };
  if (enr.status !== "신청") return { error: "이미 처리된 신청입니다. 목록을 새로고침해 주세요." };

  const { data, error } = await admin
    .from("enrollments")
    .update({ status: "거절", teacher_note: reason.slice(0, 1000) })
    .eq("id", enrollmentId)
    .eq("status", "신청")
    .select("id");
  if (error) return { error: "처리 중 오류가 발생했어요." };
  if (!data || data.length === 0) return { error: "이미 처리된 신청입니다. 목록을 새로고침해 주세요." };

  if (enr.student_phone) {
    try {
      await sendSms(enr.student_phone, `[프렌딩 스쿨] 수강신청이 거절되었습니다. ${enr.course_title}. 사유: ${reason}`);
    } catch (err) {
      console.error("[rejectEnrollment] SMS 발송 실패:", err);
    }
  }

  // 관리자 알림 메일 (best-effort) — 거절 사유 포함. SMS와 독립.
  try {
    const origin = getOrigin(await headers());
    const adminEmails = await getAdminEmails();
    await sendEnrollmentRejectedToAdmin(adminEmails, buildAdminEnrollmentEmail(enr, origin, { reason }));
  } catch (err) {
    console.error("[rejectEnrollment] 관리자 알림 발송 실패:", err);
  }

  await logEnrollmentEvent(admin, {
    enrollmentId,
    eventType: "enrollment_rejected",
    actorId: userId,
    actorRole: "teacher",
    course: enr.course,
    courseTitle: enr.course_title,
    studentName: enr.student_name,
    teacherName: enr.teacher_name,
    detail: { reason },
  });

  revalidatePath("/teacher", "layout");
  return { ok: true };
}

export async function updateTeacherAvatar(avatarUrl: string): Promise<TeacherActionState> {
  const userId = await requireTeacher();
  if (!userId) return { error: "You don't have permission." };

  // 본인 폴더(avatars/<uid>/...)의 공개 URL인지 검증 — 임의 URL 저장 차단.
  if (!avatarUrl || !avatarUrl.includes(`/avatars/${userId}/`)) {
    return { error: "Invalid image path." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ avatar_url: avatarUrl }).eq("id", userId);
  if (error) return { error: "Something went wrong while saving the image." };

  revalidatePath("/teacher", "layout");
  return { ok: true };
}
