"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getUserRole } from "@/lib/auth";
import { isValidZoomUrl } from "@/lib/url";

export type FrienderActionState = { ok?: boolean; error?: string };

// 프렌더 액션 진입 가드 — 세션으로 role 확인(friender 또는 admin) 후 userId 반환.
async function requireFriender(): Promise<string | null> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const role = await getUserRole(supabase, user.id);
  return role === "friender" || role === "admin" ? user.id : null;
}

// 빈 문자열은 null로 저장, 길이 제한 적용.
function clean(value: FormDataEntryValue | null, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export async function updateFrienderProfile(_prev: FrienderActionState, formData: FormData): Promise<FrienderActionState> {
  const userId = await requireFriender();
  if (!userId) return { error: "권한이 없습니다." };

  const bio = clean(formData.get("bio"), 2000);
  const zoomUrl = clean(formData.get("zoom_url"), 500);

  // 이름·국적·성별·전화번호는 프렌더가 수정 불가(승인 시 확정) — 서버에서 읽지도·갱신하지도 않음.
  // 둘 다 필수 (clean()이 공백-only를 null로 만들어 우회 차단).
  if (!bio || !zoomUrl) return { error: "필수 항목을 모두 입력해 주세요." };
  if (!isValidZoomUrl(zoomUrl)) return { error: "올바른 Zoom URL을 입력해 주세요. (http:// 또는 https://로 시작)" };

  // service_role로 본인 row의 화이트리스트 컬럼만 갱신 (name/nationality/gender/phone/role 등은 제외).
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ bio, zoom_url: zoomUrl }).eq("id", userId);
  if (error) return { error: "저장 중 문제가 발생했습니다." };

  revalidatePath("/friender", "layout");
  return { ok: true };
}

export async function updateFrienderAvatar(avatarUrl: string): Promise<FrienderActionState> {
  const userId = await requireFriender();
  if (!userId) return { error: "권한이 없습니다." };

  // 본인 폴더(avatars/<uid>/...)의 공개 URL인지 검증 — 임의 URL 저장 차단.
  if (!avatarUrl || !avatarUrl.includes(`/avatars/${userId}/`)) {
    return { error: "올바르지 않은 이미지 경로입니다." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ avatar_url: avatarUrl }).eq("id", userId);
  if (error) return { error: "이미지 저장 중 문제가 발생했습니다." };

  revalidatePath("/friender", "layout");
  return { ok: true };
}
