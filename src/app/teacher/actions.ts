"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getUserRole } from "@/lib/auth";
import { isValidZoomUrl } from "@/lib/url";
import { NATIONALITY_NAMES } from "@/data/nationalities";
import { GENDER_VALUES } from "@/data/genders";
import { resolveCenterId } from "@/lib/center";
import { sendSms } from "@/lib/sms";
import { isValidSlot, slotsOverlap, type Slot } from "@/lib/availability";

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

  const firstName = clean(formData.get("first_name"), 40);
  const lastName = clean(formData.get("last_name"), 40);
  const bio = clean(formData.get("bio"), 2000);
  const experience = clean(formData.get("experience"), 2000);
  const phone = clean(formData.get("phone"), 30);
  const nationality = clean(formData.get("nationality"), 60);
  const gender = clean(formData.get("gender"), 20);
  const zoomUrl = clean(formData.get("zoom_url"), 500);

  // 전화번호를 제외한 항목은 필수 (clean()이 공백-only를 null로 만들어 우회 차단).
  if (!firstName || !lastName || !bio || !experience || !nationality || !gender || !zoomUrl) {
    return { error: "Please fill in all required fields." };
  }

  // 국적·성별은 화이트리스트 값만 허용(임의 문자열 차단).
  if (!NATIONALITY_NAMES.includes(nationality)) {
    return { error: "Please select your nationality." };
  }
  if (!GENDER_VALUES.includes(gender)) {
    return { error: "Please select your gender." };
  }

  if (!isValidZoomUrl(zoomUrl)) {
    return { error: "Invalid Zoom URL. (must start with http:// or https://)" };
  }

  // service_role로 본인 row의 화이트리스트 컬럼만 갱신 (role 등은 절대 미포함).
  const admin = createAdminClient();
  // 센터는 선택 — 유효한 center id가 아니면 null("None").
  const centerId = await resolveCenterId(admin, formData.get("center_id"));
  const { error } = await admin
    .from("profiles")
    .update({ first_name: firstName, last_name: lastName, bio, experience, phone, nationality, gender, center_id: centerId, zoom_url: zoomUrl })
    .eq("id", userId);
  if (error) return { error: "Something went wrong while saving." };

  revalidatePath("/teacher");
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
    revalidatePath("/teacher");
    return { ok: true };
  }
  // 3) bulk insert.
  const { error: insErr } = await admin.from("teacher_availability").insert(rows);
  if (insErr) return { error: "Something went wrong while saving." };

  revalidatePath("/teacher");
  return { ok: true };
}

/* ===== 수강신청 승인/거절 (강사 대시보드) ===== */

// 본인에게 온 '신청' 상태 수강신청을 로드(소유권 가드). 처리 대상이 아니면 null.
async function loadOwnPendingEnrollment(admin: ReturnType<typeof createAdminClient>, enrollmentId: string, teacherId: string) {
  const { data } = await admin
    .from("enrollments")
    .select("id, teacher_id, status, student_phone, student_name, course_title, start_date")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (!data || data.teacher_id !== teacherId) return null;
  return data as {
    id: string;
    teacher_id: string;
    status: string;
    student_phone: string | null;
    student_name: string | null;
    course_title: string;
    start_date: string;
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
    .select("slots")
    .eq("teacher_id", userId)
    .in("status", ["승인", "결제대기", "결제완료"])
    .neq("id", enrollmentId);
  const bookedSlots: Slot[] = (approvedRows ?? []).flatMap((r: { slots: unknown }) => parse(r.slots));
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

  revalidatePath("/teacher");
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

  revalidatePath("/teacher");
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

  revalidatePath("/teacher");
  return { ok: true };
}
