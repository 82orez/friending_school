"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { isAdmin } from "@/lib/auth";
import { getOrigin } from "@/lib/origin";
import { sendTeacherApprovalNotification, sendTeacherRejectionNotification } from "@/lib/mailer";
import { normalizeCurrency } from "@/data/currencies";
import { sendSms } from "@/lib/sms";

export type ActionResult = { ok: boolean; error?: string };

const STATUSES = ["신청", "확인", "완료", "취소"] as const;
type Status = (typeof STATUSES)[number];

// 모든 admin 액션의 진입 가드 — 세션 클라이언트로 admin 확인 후에만 service_role 쓰기 허용.
async function requireAdmin(): Promise<boolean> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  return isAdmin(supabase, user.id);
}

/* ===== 신청 관리 ===== */

export async function updateApplication(id: string, status: string, adminNote: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  if (!id || !STATUSES.includes(status as Status)) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("applications")
    .update({ status, admin_note: adminNote || null })
    .eq("id", id);
  if (error) return { ok: false, error: "저장 중 오류가 발생했습니다." };

  revalidatePath("/admin");
  return { ok: true };
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
  revalidatePath("/teacher");
  revalidatePath("/admin/teacher-requests");
}

// 1 페소당 원화 환율 저장(settings.php_to_krw). admin만, 양수만 허용.
export async function updateExchangeRate(phpToKrw: number | string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  const n = Number(phpToKrw);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, error: "유효한 환율을 입력하세요." };

  const admin = createAdminClient();
  const { error } = await admin.from("settings").upsert({ key: "php_to_krw", value: String(n) }, { onConflict: "key" });
  if (error) return { ok: false, error: "환율 저장 중 오류가 발생했습니다." };

  revalidatePath("/admin/centers");
  return { ok: true };
}

// 단가 입력(원) 정규화: 빈 값/비숫자/음수 → null, 그 외 정수로 내림.
function normalizePrice(raw: number | string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export async function addCenter(name: string, price?: number | string | null, currency?: string | null): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  const clean = name?.trim();
  if (!clean) return { ok: false, error: "센터 이름은 필수입니다." };

  const admin = createAdminClient();
  // 새 센터는 목록 끝으로 (sort_order 자동 증가).
  const { data: maxRow } = await admin.from("centers").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const nextOrder = ((maxRow as { sort_order?: number } | null)?.sort_order ?? 0) + 1;

  const { error } = await admin
    .from("centers")
    .insert({ name: clean, sort_order: nextOrder, price_per_session: normalizePrice(price), price_currency: normalizeCurrency(currency) });
  if (error) return { ok: false, error: "등록 중 오류가 발생했습니다." };

  revalidateCenterConsumers();
  return { ok: true };
}

export async function updateCenter(id: string, name: string, price?: number | string | null, currency?: string | null): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  const clean = name?.trim();
  if (!id || !clean) return { ok: false, error: "센터 이름은 필수입니다." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("centers")
    .update({ name: clean, price_per_session: normalizePrice(price), price_currency: normalizeCurrency(currency) })
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
  revalidatePath("/teacher");
  return { ok: true };
}

/* ===== 수강신청 관리 ===== */

// 관리자 강제 취소 — 상태 '신청'/'승인'일 때만. 성공 시 학생에게 SMS 통보(best-effort).
// 슬롯은 동적 차감이라('승인'만 강사 가용 소비) 취소 즉시 자동 해제.
export async function adminCancelEnrollment(id: string, note: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  const enrollmentId = String(id ?? "").trim();
  const reason = String(note ?? "").trim();
  if (!enrollmentId) return { ok: false, error: "잘못된 요청입니다." };
  if (!reason) return { ok: false, error: "취소 사유를 입력해 주세요." };

  const admin = createAdminClient();
  const { data: enr } = await admin.from("enrollments").select("status, student_phone, course_title").eq("id", enrollmentId).maybeSingle();
  if (!enr) return { ok: false, error: "신청을 찾을 수 없습니다." };
  if (enr.status !== "신청" && enr.status !== "승인") return { ok: false, error: "취소할 수 없는 상태입니다." };

  const { data, error } = await admin
    .from("enrollments")
    .update({ status: "취소", teacher_note: `[관리자] ${reason}`.slice(0, 1000) })
    .eq("id", enrollmentId)
    .in("status", ["신청", "승인"])
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

  revalidatePath("/admin/enrollments");
  revalidatePath("/teacher");
  revalidatePath("/mypage");
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
  revalidatePath("/teacher");
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
