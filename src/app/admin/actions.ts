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

// student ↔ teacher 변경. admin 회원은 대상에서 제외(잠금 방지). role은 profiles + app_metadata 동기.
export async function updateMemberRole(userId: string, role: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  if (!userId || !ASSIGNABLE_ROLES.includes(role as AssignableRole)) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();

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

  revalidatePath("/admin/members");
  return { ok: true };
}
