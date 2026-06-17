"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { isAdmin } from "@/lib/auth";

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

// 강사 지원 승인 → role=teacher 동기 + 신청 상태 '승인' + profiles 빈 필드 best-effort prefill.
export async function approveTeacherApplication(id: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data: app } = await admin
    .from("teacher_applications")
    .select("id, user_id, name, first_name, last_name, bio, experience, phone, zoom_url, avatar_url, status")
    .eq("id", id)
    .maybeSingle();
  if (!app) return { ok: false, error: "지원 내역을 찾을 수 없습니다." };

  const a = app as {
    user_id: string;
    name: string;
    first_name: string | null;
    last_name: string | null;
    bio: string | null;
    experience: string | null;
    phone: string | null;
    zoom_url: string | null;
    avatar_url: string | null;
  };

  const roleRes = await setUserRole(admin, a.user_id, "teacher");
  if (!roleRes.ok) return roleRes;

  const { error: statusError } = await admin.from("teacher_applications").update({ status: "승인" }).eq("id", id);
  if (statusError) return { ok: false, error: "상태 변경 중 오류가 발생했습니다." };

  // 강사 프로필을 신청서 내용으로 채움(덮어쓰기). 필수(first/last/bio)는 항상,
  // 선택(experience/phone/zoom_url/avatar_url)은 값 있을 때만 set(빈값 clobber 방지).
  const fill: Record<string, string> = {
    first_name: a.first_name || a.name,
    last_name: a.last_name ?? "",
    bio: a.bio ?? "",
  };
  if (a.experience) fill.experience = a.experience;
  if (a.phone) fill.phone = a.phone;
  if (a.zoom_url) fill.zoom_url = a.zoom_url;
  if (a.avatar_url) fill.avatar_url = a.avatar_url;
  await admin.from("profiles").update(fill).eq("id", a.user_id);

  revalidatePath("/admin/teacher-requests");
  revalidatePath("/teacher");
  return { ok: true };
}

// 강사 지원 거절 (상태 '거절' + 관리자 메모). role 변경 없음.
export async function rejectTeacherApplication(id: string, adminNote: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("teacher_applications")
    .update({ status: "거절", admin_note: adminNote || null })
    .eq("id", id);
  if (error) return { ok: false, error: "저장 중 오류가 발생했습니다." };

  revalidatePath("/admin/teacher-requests");
  return { ok: true };
}
