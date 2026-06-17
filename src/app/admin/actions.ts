"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { isAdmin } from "@/lib/auth";
import { getOrigin } from "@/lib/origin";
import { sendTeacherApprovalNotification, sendTeacherRejectionNotification } from "@/lib/mailer";

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

/* ===== 회원 Role 관리 ===== */

const ASSIGNABLE_ROLES = ["student", "teacher"] as const;
type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

// student ↔ teacher 변경 공용 헬퍼. admin 회원은 대상에서 제외(잠금 방지). role은 profiles + app_metadata 동기.
// ⚠️ requireAdmin()은 호출 측에서 먼저 통과시킬 것 — 이 함수는 service_role 쓰기만 담당.
async function setUserRole(admin: ReturnType<typeof createAdminClient>, userId: string, role: AssignableRole): Promise<ActionResult> {
  if (!userId) return { ok: false, error: "잘못된 요청입니다." };

  // 대상이 admin이면 변경 거부 (admin 잠금/강등 방지).
  const { data: current } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
  if ((current as { role?: string } | null)?.role === "admin") {
    return { ok: false, error: "관리자 계정의 역할은 변경할 수 없습니다." };
  }

  const { error: profileError } = await admin.from("profiles").update({ role }).eq("id", userId);
  if (profileError) return { ok: false, error: "역할 변경 중 오류가 발생했습니다." };

  // app_metadata.role 동기 (role 읽기는 profiles 우선이나, JWT 일관성 위해 함께 갱신)
  const { error: authError } = await admin.auth.admin.updateUserById(userId, { app_metadata: { role } });
  if (authError) return { ok: false, error: "역할 동기화 중 오류가 발생했습니다." };

  return { ok: true };
}

// 강사 자격 회수 (teacher → student). teacher-requests 화면의 "현재 강사" 목록에서 호출.
export async function revokeTeacher(userId: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  const admin = createAdminClient();
  const res = await setUserRole(admin, userId, "student");
  if (!res.ok) return res;
  revalidatePath("/admin/teacher-requests");
  return { ok: true };
}

/* ===== 강사 지원 관리 ===== */

// 지원자 이메일 + 이름 조회 (알림 메일용). 실패 시 null.
async function getApplicantContact(
  admin: ReturnType<typeof createAdminClient>,
  appId: string,
): Promise<{ email: string; name: string } | null> {
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
      await sendTeacherRejectionNotification([contact.email], { name: contact.name, reason: adminNote || "", mypageUrl: `${origin}/mypage` });
    }
  } catch (err) {
    console.error("[rejectTeacherApplication] 거절 알림 발송 실패:", err);
  }

  revalidatePath("/admin/teacher-requests");
  return { ok: true };
}
