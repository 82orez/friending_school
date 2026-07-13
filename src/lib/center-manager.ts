import "server-only";

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

// 사용자가 담당하는 센터 목록(centers.manager_id = userId). 없으면 빈 배열.
export async function loadManagedCenters(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<{ id: string; name: string }[]> {
  const { data } = await admin.from("centers").select("id, name").eq("manager_id", userId).order("sort_order", { ascending: true });
  return ((data ?? []) as { id: string; name: string }[]).map((c) => ({ id: c.id, name: c.name }));
}

// 센터 매니저 진입 가드 — 세션 사용자가 담당 센터가 하나라도 있으면 { userId, centers, centerIds } 반환, 아니면 null.
// requireAdmin/requireTeacher와 동일 규약(액션·page 첫 줄 가드). 담당 센터 조회는 service_role.
export async function requireCenterManager(): Promise<{ userId: string; centers: { id: string; name: string }[]; centerIds: string[] } | null> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const centers = await loadManagedCenters(admin, user.id);
  if (centers.length === 0) return null;
  return { userId: user.id, centers, centerIds: centers.map((c) => c.id) };
}

// 경량 판별(레이아웃/Navbar용) — 담당 센터 존재 여부만.
export async function isCenterManager(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<boolean> {
  const { count } = await admin.from("centers").select("id", { count: "exact", head: true }).eq("manager_id", userId);
  return (count ?? 0) > 0;
}
