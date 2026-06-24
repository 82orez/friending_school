"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { formatRetryAfter, getClientIp, rateLimit } from "@/lib/rate-limit";
import { getCourse } from "@/data/courses";
import { sendEnrollmentNotificationToTeacher } from "@/lib/mailer";
import { getOrigin } from "@/lib/origin";
import { isValidSlot, slotsOverlap, subtractSlots, summarizeSlots, teacherHasAllSlots, type Slot } from "@/lib/availability";

// 학생 수강신청용 강사 카드(공개 안전 필드만 — 이메일/전화 등 PII 제외). slots는 클라이언트 라이브 필터용.
export type EnrollTeacherCard = {
  id: string;
  name: string;
  avatarUrl: string | null;
  nationality: string | null;
  gender: string | null;
  centerName: string | null;
  bio: string | null;
  slots: Slot[];
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

// 강사 id 목록의 '승인'된 예약 슬롯을 강사별로 union(중복 예약 차감용).
async function loadBookedSlotsByTeacher(admin: ReturnType<typeof createAdminClient>, teacherIds: string[]): Promise<Map<string, Slot[]>> {
  const out = new Map<string, Slot[]>();
  if (teacherIds.length === 0) return out;
  const { data } = await admin.from("enrollments").select("teacher_id, slots").in("teacher_id", teacherIds).eq("status", "승인");
  for (const r of (data ?? []) as { teacher_id: string; slots: unknown }[]) {
    const list = out.get(r.teacher_id) ?? [];
    list.push(...parseSlots(r.slots));
    out.set(r.teacher_id, list);
  }
  return out;
}

// 전체 강사(공개 안전 필드 + 주간 슬롯)를 반환 — 위저드가 클라이언트에서 `teacherHasAllSlots`로 라이브 필터.
// enroll 페이지(server component, 로그인+폰인증 가드 통과 후)에서 호출.
export async function loadEnrollTeachers(): Promise<EnrollTeacherCard[]> {
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

  // 이미 '승인'된 예약 슬롯은 강사 가용에서 차감(중복 예약 방지) — 학생은 남은 슬롯만 보게 됨.
  const bookedByTeacher = await loadBookedSlotsByTeacher(admin, ids);

  return teachers.map((t) => ({
    id: t.id,
    name: [t.first_name, t.last_name].filter(Boolean).join(" ").trim() || "강사",
    avatarUrl: t.avatar_url,
    nationality: t.nationality,
    gender: t.gender,
    centerName: t.center_id ? (centerNameById.get(t.center_id) ?? null) : null,
    bio: t.bio,
    slots: subtractSlots(byTeacher.get(t.id) ?? [], bookedByTeacher.get(t.id) ?? []),
  }));
}

// 오늘 날짜(KST) YYYY-MM-DD.
function todayKst(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
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
  if (startDate <= todayKst()) return { error: "수업 시작일은 내일 이후로 선택해 주세요." };
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
  const { data: profile } = await supabase.from("profiles").select("first_name, last_name, phone, phone_verified_at").eq("id", user.id).maybeSingle();
  if (!profile?.phone_verified_at || !profile?.phone) {
    return { error: "휴대폰 인증이 필요합니다. 마이페이지에서 인증을 완료해 주세요." };
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
  // 유효 가용 = 강사 템플릿 − 이미 '승인'된 예약 슬롯(중복 예약 방지).
  const booked = (await loadBookedSlotsByTeacher(admin, [teacherId])).get(teacherId) ?? [];
  const effective = subtractSlots(teacherSlots, booked);
  if (!teacherHasAllSlots(effective, slots)) {
    return { error: "선택한 시간이 더 이상 가능하지 않아요. 일정을 다시 선택해 주세요." };
  }

  // 학생 본인 시간 충돌 차단 — 진행 중('신청'/'승인') 신청과 겹치면 거절.
  const { data: myRows } = await admin.from("enrollments").select("slots").eq("student_id", user.id).in("status", ["신청", "승인"]);
  const mySlots: Slot[] = (myRows ?? []).flatMap((r: { slots: unknown }) => parseSlots(r.slots));
  if (slotsOverlap(slots, mySlots)) {
    return { error: "이미 같은 시간에 신청한 수업이 있어요. 일정을 다시 선택해 주세요." };
  }

  // 본인 세션 client로 insert(RLS enrollments_insert: student_id=auth.uid()).
  const { error: insErr } = await supabase.from("enrollments").insert({
    student_id: user.id,
    teacher_id: teacherId,
    course: course.slug,
    course_title: course.title,
    start_date: startDate,
    slots,
    teacher_name: teacherName,
    student_name: studentName,
    student_phone: profile.phone,
  });
  if (insErr) return { error: "신청 저장 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요." };

  // 강사 알림 메일(best-effort) — 실패해도 신청 성공과 분리.
  try {
    const { data: teacherUser } = await admin.auth.admin.getUserById(teacherId);
    const teacherEmail = teacherUser?.user?.email;
    if (teacherEmail) {
      const origin = getOrigin(await headers());
      await sendEnrollmentNotificationToTeacher([teacherEmail], {
        studentName,
        courseTitle: course.title,
        schedule: summarizeSlots(slots, false),
        startDate,
        teacherUrl: `${origin}/teacher`,
      });
    }
  } catch (err) {
    console.error("[submitEnrollment] 강사 알림 발송 실패:", err);
  }

  revalidatePath("/mypage");
  return { success: true };
}
