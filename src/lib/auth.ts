import type { SupabaseClient } from "@supabase/supabase-js";

// 권한(role) 읽기는 profiles.role만 사용 (JWT app_metadata는 재로그인 전까지 stale 가능).
// profiles RLS(_select_own)로 본인 row 조회 — 마이그레이션 직후에도 즉시 반영.

export async function getUserRole(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  return (data as { role?: string } | null)?.role ?? null;
}

export async function isAdmin(supabase: SupabaseClient, userId: string): Promise<boolean> {
  return (await getUserRole(supabase, userId)) === "admin";
}

export async function isTeacher(supabase: SupabaseClient, userId: string): Promise<boolean> {
  return (await getUserRole(supabase, userId)) === "teacher";
}

export async function isFriender(supabase: SupabaseClient, userId: string): Promise<boolean> {
  return isFrienderRole(await getUserRole(supabase, userId));
}

// 프렌더 계열 role — 일반 프렌더(무료 연습방)와 상위 등급 프렌더 Plus(유료방까지).
// role은 단일값이라 friender_plus는 friender가 "아니므로", 프렌더 가드는 전부 아래 판정을 쓴다.
export const FRIENDER_ROLES = ["friender", "friender_plus"] as const;

export function isFrienderRole(role: string | null | undefined): boolean {
  return role === "friender" || role === "friender_plus";
}

// Plus 전용 기능(유료방 개설 등) 게이팅 지점 — 방 개설 기능 추가 시 여기에 건다.
export function isFrienderPlusRole(role: string | null | undefined): boolean {
  return role === "friender_plus";
}
