"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getUserRole } from "@/lib/auth";

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

function isValidZoomUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function updateTeacherProfile(_prev: TeacherActionState, formData: FormData): Promise<TeacherActionState> {
  const userId = await requireTeacher();
  if (!userId) return { error: "You don't have permission." };

  const fullName = clean(formData.get("full_name"), 60);
  const headline = clean(formData.get("headline"), 100);
  const bio = clean(formData.get("bio"), 2000);
  const phone = clean(formData.get("phone"), 30);
  const zoomUrl = clean(formData.get("zoom_url"), 500);

  if (zoomUrl && !isValidZoomUrl(zoomUrl)) {
    return { error: "Invalid Zoom URL. (must start with http:// or https://)" };
  }

  // service_role로 본인 row의 화이트리스트 컬럼만 갱신 (role 등은 절대 미포함).
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ full_name: fullName, headline, bio, phone, zoom_url: zoomUrl })
    .eq("id", userId);
  if (error) return { error: "Something went wrong while saving." };

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
