import "server-only";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function createAdminClient() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY 환경 변수가 설정되지 않았습니다.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function emailExists(email: string): Promise<boolean> {
  const admin = createAdminClient();
  const target = email.toLowerCase();
  const perPage = 1000;
  const maxPages = 50;
  for (let page = 1; page <= maxPages; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return false;
    const users = (data?.users ?? []) as Array<{ email?: string | null }>;
    if (users.length === 0) return false;
    if (users.some((u) => u.email?.toLowerCase() === target)) return true;
    if (users.length < perPage) return false;
  }
  return false;
}
