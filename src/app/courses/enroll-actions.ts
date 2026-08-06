"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { formatRetryAfter, getClientIp, rateLimit } from "@/lib/rate-limit";
import { getCourse } from "@/data/courses";
import { sendEnrollmentNotificationToTeacher, sendEnrollmentNotificationToAdmin } from "@/lib/mailer";
import { getAdminEmails } from "@/utils/supabase/admin";
import { getOrigin } from "@/lib/origin";
import { logEnrollmentEvent } from "@/lib/events";
import { notifyCenterManagerOfEnrollment } from "@/lib/center-notify";
import {
  TOTAL_SESSIONS,
  isValidSlot,
  lessonEndDate,
  slotsOverlap,
  subtractSlots,
  summarizeSlots,
  teacherHasAllSlots,
  type Slot,
} from "@/lib/availability";
import { loadEndedEnrollmentIds, todayKst } from "@/lib/booking";

// 학생 수강신청용 강사 카드(공개 안전 필드만 — 이메일/전화 등 PII 제외). slots는 클라이언트 라이브 필터용.
// heldSlots: 다른 학생의 진행중 신청('신청'/'결제대기')이 잡고 있는 슬롯 — 하드 차단은 아니고, 겹치면 확인 단계에서 경고용.
export type EnrollTeacherCard = {
  id: string;
  name: string;
  avatarUrl: string | null;
  nationality: string | null;
  gender: string | null;
  centerName: string | null;
  bio: string | null;
  slots: Slot[];
  heldSlots: Slot[];
};

export type EnrollState = { error?: string; success?: boolean };

// 입력 슬롯 정규화: 유효성 검증 + 중복 제거.
function normalizeSlots(raw: unknown): Slot[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Slot[] = [];
  for (const s of raw) {
    if (!isValidSlot(s)) continue;
    const day = Number((s as Slot).day);
    const min = Number((s as Slot).min);
    const key = `${day}-${min}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ day, min });
  }
  return out;
}

// enrollments.slots(jsonb)를 안전하게 Slot[]로 파싱.
function parseSlots(raw: unknown): Slot[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isValidSlot).map((s) => ({ day: Number(s.day), min: Number(s.min) }));
}

// 강사 id 목록의 진행중 enrollment 슬롯을 강사별로 두 종류로 union:
//  - confirmed: '승인'(레거시)·'결제완료'(결제 확정) → 가용에서 차감(슬롯 숨김)·신청 하드 차단.
//  - held: '신청'+'결제대기'(소프트 보류) → 차단하지 않고, 겹치면 경고용(heldSlots). excludeStudentId(본인)는 held에서 제외.
async function loadEnrollmentSlotsByTeacher(
  admin: ReturnType<typeof createAdminClient>,
  teacherIds: string[],
  excludeStudentId?: string,
): Promise<{ confirmed: Map<string, Slot[]>; held: Map<string, Slot[]> }> {
  const confirmed = new Map<string, Slot[]>();
  const held = new Map<string, Slot[]>();
  if (teacherIds.length === 0) return { confirmed, held };
  // 종료된 '결제완료'(남은 예정 수업 없음)는 점유에서 제외 — 마지막 수업 다음날부터 슬롯 해제.
  const ended = await loadEndedEnrollmentIds(admin, teacherIds);
  const { data } = await admin
    .from("enrollments")
    .select("id, teacher_id, student_id, slots, status")
    .in("teacher_id", teacherIds)
    .in("status", ["신청", "승인", "결제대기", "결제완료"]);
  for (const r of (data ?? []) as { id: string; teacher_id: string; student_id: string; slots: unknown; status: string }[]) {
    if (r.status === "승인" || r.status === "결제완료") {
      if (r.status === "결제완료" && ended.has(r.id)) continue; // 종료된 과정 → 차감 안 함
      const list = confirmed.get(r.teacher_id) ?? [];
      list.push(...parseSlots(r.slots));
      confirmed.set(r.teacher_id, list);
    } else {
      // '신청'/'결제대기' — 본인 것은 held에서 제외(본인 신청을 "다른 학생"으로 오인 방지).
      if (excludeStudentId && r.student_id === excludeStudentId) continue;
      const list = held.get(r.teacher_id) ?? [];
      list.push(...parseSlots(r.slots));
      held.set(r.teacher_id, list);
    }
  }
  return { confirmed, held };
}

// 전체 강사(공개 안전 필드 + 주간 슬롯)를 반환 — 위저드가 클라이언트에서 `teacherHasAllSlots`로 라이브 필터.
// enroll 페이지(server component, 로그인+폰인증 가드 통과 후)에서 호출. currentUserId는 heldSlots 본인 제외용.
export async function loadEnrollTeachers(currentUserId?: string): Promise<EnrollTeacherCard[]> {
  const admin = createAdminClient();
  const { data: profiles, error: profErr } = await admin
    .from("profiles")
    .select("id, first_name, last_name, avatar_url, nationality, gender, center_id, bio")
    .eq("role", "teacher");
  if (profErr) {
    console.error("[loadEnrollTeachers] 강사 조회 실패:", profErr);
    return [];
  }
  const teachers = (profiles ?? []) as {
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    nationality: string | null;
    gender: string | null;
    center_id: string | null;
    bio: string | null;
  }[];
  if (teachers.length === 0) return [];

  // 센터 이름 resolve.
  const { data: centersData } = await admin.from("centers").select("id, name");
  const centerNameById = new Map<string, string>((centersData ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));

  // 강사별 가용 슬롯 일괄 조회 → 그룹핑.
  const ids = teachers.map((t) => t.id);
  const { data: slotRows } = await admin.from("teacher_availability").select("teacher_id, day_of_week, start_min").in("teacher_id", ids);
  const byTeacher = new Map<string, Slot[]>();
  for (const r of (slotRows ?? []) as { teacher_id: string; day_of_week: number; start_min: number }[]) {
    const list = byTeacher.get(r.teacher_id) ?? [];
    list.push({ day: r.day_of_week, min: r.start_min });
    byTeacher.set(r.teacher_id, list);
  }

  // 확정('승인')만 가용에서 차감(슬롯 숨김). '결제대기'/'신청'은 차감하지 않고 heldSlots로 노출(겹치면 경고).
  const { confirmed, held } = await loadEnrollmentSlotsByTeacher(admin, ids, currentUserId);

  return teachers.map((t) => ({
    id: t.id,
    name: [t.first_name, t.last_name].filter(Boolean).join(" ").trim() || "강사",
    avatarUrl: t.avatar_url,
    nationality: t.nationality,
    gender: t.gender,
    centerName: t.center_id ? (centerNameById.get(t.center_id) ?? null) : null,
    bio: t.bio,
    slots: subtractSlots(byTeacher.get(t.id) ?? [], confirmed.get(t.id) ?? []),
    heldSlots: held.get(t.id) ?? [],
  }));
}

// 수강신청 저장. 가드: (1)로그인 (2)휴대폰 인증 (3)입력 검증 (4)rateLimit (5)강사 가용시간 재검증 (6)insert (7)강사 알림 메일.
export async function submitEnrollment(_prev: EnrollState, formData: FormData): Promise<EnrollState> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다. 다시 로그인해 주세요." };

  const courseSlug = String(formData.get("courseSlug") ?? "");
  const teacherId = String(formData.get("teacherId") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "").trim();
  let parsedSlots: unknown = [];
  try {
    parsedSlots = JSON.parse(String(formData.get("slots") ?? "[]"));
  } catch {
    return { error: "일정 정보가 올바르지 않습니다. 다시 선택해 주세요." };
  }

  const course = getCourse(courseSlug);
  if (!course) return { error: "잘못된 과정입니다. 페이지를 새로고침해 주세요." };

  const slots = normalizeSlots(parsedSlots);
  if (slots.length === 0) return { error: "원하는 수업 요일과 시간을 선택해 주세요." };
  if (slots.length > 7 * 36) return { error: "선택한 시간이 너무 많습니다." };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return { error: "수업 시작일을 선택해 주세요." };
  // 하한: 오늘+3일(D+3, KST). 오늘 문자열에 3일 더해 비교(UTC 자정 기준 → tz 무관).
  const minKst = (() => {
    const d = new Date(`${todayKst()}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 3);
    return d.toISOString().slice(0, 10);
  })();
  if (startDate < minKst) return { error: "수업 시작일은 오늘부터 3일 이후로 선택해 주세요." };
  // 상한: 오늘+14일(2주) 이내. KST 오늘 문자열에 14일 더해 비교(UTC 자정 기준 → tz 무관).
  const maxKst = (() => {
    const d = new Date(`${todayKst()}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 14);
    return d.toISOString().slice(0, 10);
  })();
  if (startDate > maxKst) return { error: "수업 시작일은 오늘부터 2주 이내로 선택해 주세요." };
  // 시작일 요일이 신청한 수업 요일 중 하나인지 확인(UTC 자정 파싱 → tz 무관 요일). day: 0=일, getUTCDay와 동일.
  const startDow = new Date(`${startDate}T00:00:00Z`).getUTCDay();
  if (!slots.some((s) => s.day === startDow)) return { error: "수업 시작일은 선택한 수업 요일 중 하나여야 합니다." };

  if (!teacherId) return { error: "강사를 선택해 주세요." };

  // 휴대폰 인증 + 이름 스냅샷 조회.
  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, english_name, phone, phone_verified_at")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.phone_verified_at || !profile?.phone) {
    return { error: "휴대폰 인증이 필요합니다. 마이페이지에서 인증을 완료해 주세요." };
  }
  // 영문 이름 필수 — 미등록 시 차단(마이페이지에서 등록 유도).
  if (!profile?.english_name) {
    return { error: "영문 이름을 등록해야 수강신청할 수 있어요. 마이페이지에서 등록해 주세요." };
  }
  // 한국 관례: 성+이름 붙임.
  const studentName = `${profile.last_name ?? ""}${profile.first_name ?? ""}`.trim() || user.email?.split("@")[0] || "회원";

  const ip = getClientIp(await headers());
  const rl = rateLimit(`enroll:${ip}`, 5, 10 * 60_000);
  if (!rl.allowed) return { error: `신청이 너무 많아요. ${formatRetryAfter(rl.retryAfterSec)} 다시 시도해 주세요.` };

  // 강사 검증 + 가용시간 재검증(경쟁/위조 방지) — service_role로 신뢰 가능한 최신 슬롯 조회.
  const admin = createAdminClient();
  const { data: teacherProfile } = await admin.from("profiles").select("id, role, first_name, last_name").eq("id", teacherId).maybeSingle();
  if (!teacherProfile || teacherProfile.role !== "teacher") return { error: "선택한 강사를 찾을 수 없어요. 목록을 새로고침해 주세요." };
  const teacherName = [teacherProfile.first_name, teacherProfile.last_name].filter(Boolean).join(" ").trim() || "강사";

  const { data: slotRows } = await admin.from("teacher_availability").select("day_of_week, start_min").eq("teacher_id", teacherId);
  const teacherSlots: Slot[] = (slotRows ?? []).map((r: { day_of_week: number; start_min: number }) => ({ day: r.day_of_week, min: r.start_min }));
  // 유효 가용 = 강사 템플릿 − 확정('승인') 예약 슬롯. '결제대기'/'신청'은 하드 차단하지 않음(겹쳐도 신청 허용, 클라가 경고).
  const { confirmed } = await loadEnrollmentSlotsByTeacher(admin, [teacherId]);
  const effective = subtractSlots(teacherSlots, confirmed.get(teacherId) ?? []);
  if (!teacherHasAllSlots(effective, slots)) {
    return { error: "선택한 시간이 더 이상 가능하지 않아요. 일정을 다시 선택해 주세요." };
  }

  // 학생 본인 시간 충돌 차단 — 진행 중('신청'/'승인'/'결제대기') 신청과 겹치면 거절.
  const { data: myRows } = await admin
    .from("enrollments")
    .select("slots")
    .eq("student_id", user.id)
    .in("status", ["신청", "승인", "결제대기", "결제완료"]);
  const mySlots: Slot[] = (myRows ?? []).flatMap((r: { slots: unknown }) => parseSlots(r.slots));
  if (slotsOverlap(slots, mySlots)) {
    return { error: "이미 같은 시간에 신청한 수업이 있어요. 일정을 다시 선택해 주세요." };
  }

  // 본인 세션 client로 insert(RLS enrollments_insert: student_id=auth.uid()). RLS _select_own_student로 id 회수.
  const { data: inserted, error: insErr } = await supabase
    .from("enrollments")
    .insert({
      student_id: user.id,
      teacher_id: teacherId,
      course: course.slug,
      course_title: course.title,
      start_date: startDate,
      slots,
      teacher_name: teacherName,
      student_name: studentName,
      student_english_name: profile.english_name,
      student_phone: profile.phone,
    })
    .select("id")
    .maybeSingle();
  if (insErr) return { error: "신청 저장 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요." };

  await logEnrollmentEvent(admin, {
    enrollmentId: inserted?.id ?? null,
    eventType: "enrollment_created",
    actorId: user.id,
    actorRole: "student",
    course: course.slug,
    courseTitle: course.title,
    studentName,
    teacherName,
    detail: { startDate, slots },
  });

  // 알림 메일 공유 값 — 강사/관리자 알림이 함께 사용.
  const origin = getOrigin(await headers());
  // 종료일 — 위저드와 동일한 lessonEndDate 사용(start_date YYYY-MM-DD를 로컬 Date로 파싱).
  const endDate = (() => {
    const [sy, sm, sd] = startDate.split("-").map(Number);
    const endObj = lessonEndDate(new Date(sy, sm - 1, sd), slots, TOTAL_SESSIONS);
    return endObj ? `${endObj.getFullYear()}-${String(endObj.getMonth() + 1).padStart(2, "0")}-${String(endObj.getDate()).padStart(2, "0")}` : "";
  })();

  // 강사 알림 메일(best-effort) — 실패해도 신청 성공과 분리.
  try {
    const { data: teacherUser } = await admin.auth.admin.getUserById(teacherId);
    const teacherEmail = teacherUser?.user?.email;
    if (teacherEmail) {
      await sendEnrollmentNotificationToTeacher([teacherEmail], {
        studentName,
        courseTitle: course.title,
        schedule: summarizeSlots(slots, false, " / "),
        startDate,
        teacherUrl: `${origin}/teacher`,
        studentEnglishName: profile.english_name ?? "",
        courseEnglishTitle: course.englishTitle,
        endDate,
        totalSessions: TOTAL_SESSIONS,
      });
    }
  } catch (err) {
    console.error("[submitEnrollment] 강사 알림 발송 실패:", err);
  }

  // 관리자 알림 메일(best-effort) — 강사 알림과 독립. 학생 이름·과정명 한글/영문 병기.
  let adminEmails: string[] = []; // 센터 매니저 알림에서 중복 수신 제외용으로 재사용.
  try {
    adminEmails = await getAdminEmails();
    await sendEnrollmentNotificationToAdmin(adminEmails, {
      studentName,
      studentEnglishName: profile.english_name ?? "",
      courseTitle: course.title,
      courseEnglishTitle: course.englishTitle,
      teacherName,
      schedule: summarizeSlots(slots, false, " / "),
      startDate,
      endDate,
      totalSessions: TOTAL_SESSIONS,
      adminUrl: `${origin}/admin/enrollments`,
    });
  } catch (err) {
    console.error("[submitEnrollment] 관리자 알림 발송 실패:", err);
  }

  // 담당 센터 매니저 알림(best-effort, 자체 try/catch) — 앞서 강사·관리자 2통을 보냈으므로 Resend 초당 2건 제한 회피 지연.
  await notifyCenterManagerOfEnrollment(admin, {
    event: "created",
    teacherId,
    teacherName,
    studentName,
    studentEnglishName: profile.english_name ?? "",
    courseTitle: course.title,
    courseEnglishTitle: course.englishTitle,
    schedule: summarizeSlots(slots, false, " / "),
    startDate,
    endDate,
    totalSessions: TOTAL_SESSIONS,
    origin,
    excludeEmails: adminEmails,
    delayMs: 1100,
  });

  revalidatePath("/mypage", "layout");
  return { success: true };
}
