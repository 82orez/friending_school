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

  const firstName = clean(formData.get("first_name"), 40);
  const lastName = clean(formData.get("last_name"), 40);
  const headline = clean(formData.get("headline"), 100);
  const bio = clean(formData.get("bio"), 2000);
  const phone = clean(formData.get("phone"), 30);
  const zoomUrl = clean(formData.get("zoom_url"), 500);

  // 전화번호를 제외한 항목은 필수 (clean()이 공백-only를 null로 만들어 우회 차단).
  if (!firstName || !lastName || !headline || !bio || !zoomUrl) {
    return { error: "Please fill in all required fields." };
  }

  if (!isValidZoomUrl(zoomUrl)) {
    return { error: "Invalid Zoom URL. (must start with http:// or https://)" };
  }

  // service_role로 본인 row의 화이트리스트 컬럼만 갱신 (role 등은 절대 미포함).
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ first_name: firstName, last_name: lastName, headline, bio, phone, zoom_url: zoomUrl })
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
