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
