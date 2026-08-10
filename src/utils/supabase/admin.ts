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

/**
 * 이메일이 등록되어 있는지 확인.
 * - `true` / `false`: 확실히 확인됨
 * - `null`: admin API 호출 실패(환경 변수 누락, 네트워크 오류 등) — 호출 측에서 모호한 케이스로 처리할 것.
 *
 * 실패 시 console.error로 서버 로그(Vercel function logs 등)에 기록되어 운영자가 진단 가능.
 */
export async function emailExists(email: string): Promise<boolean | null> {
  let admin;
  try {
    admin = createAdminClient();
  } catch (err) {
    console.error("[Supabase admin] admin client 생성 실패. SUPABASE_SERVICE_ROLE_KEY 환경 변수가 설정되어 있는지 확인하세요.", err);
    return null;
  }
  const target = email.toLowerCase();
  const perPage = 1000;
  const maxPages = 50;
  for (let page = 1; page <= maxPages; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("[Supabase admin] listUsers 호출 실패:", error);
      return null;
    }
    const users = (data?.users ?? []) as Array<{ email?: string | null }>;
    if (users.length === 0) return false;
    if (users.some((u) => u.email?.toLowerCase() === target)) return true;
    if (users.length < perPage) return false;
  }
  return false;
}

/**
 * role='admin'인 사용자들의 이메일 목록을 반환 (신청 알림 수신자).
 * profiles에서 admin id 조회 → getUserById로 이메일 확보. 실패/없음 시 빈 배열(호출 측 best-effort).
 */
export async function getAdminEmails(): Promise<string[]> {
  let admin;
  try {
    admin = createAdminClient();
  } catch (err) {
    console.error("[Supabase admin] admin client 생성 실패:", err);
    return [];
  }
  const { data: profiles, error } = await admin.from("profiles").select("id").eq("role", "admin");
  if (error || !profiles) {
    console.error("[Supabase admin] admin profiles 조회 실패:", error);
    return [];
  }
  const emails: string[] = [];
  for (const p of profiles as Array<{ id: string }>) {
    const { data, error: getErr } = await admin.auth.admin.getUserById(p.id);
    if (getErr) {
      console.error("[Supabase admin] getUserById 실패:", getErr);
      continue;
    }
    const email = data?.user?.email;
    if (email) emails.push(email);
  }
  return emails;
}

export type UserStatus = "confirmed" | "unconfirmed" | "not_found";

/**
 * 이메일의 가입 상태를 반환.
 * - "confirmed": 가입되어 있고 이메일 인증 완료
 * - "unconfirmed": 가입되어 있으나 이메일 인증 미완료
 * - "not_found": 가입되지 않음
 * - null: admin API 호출 실패(환경 변수 누락, 네트워크 오류 등)
 *
 * @deprecated provider별 분기가 필요한 새 코드에서는 `getUserIdentitySummary` 사용 권장.
 *             email/password 단일 흐름만 보던 시점에 만들어졌고, OAuth 도입 후
 *             "confirmed"가 카카오 가입자도 포함하므로 메시지 분기가 불완전.
 */
export async function getUserStatus(email: string): Promise<UserStatus | null> {
  let admin;
  try {
    admin = createAdminClient();
  } catch (err) {
    console.error("[Supabase admin] admin client 생성 실패. SUPABASE_SERVICE_ROLE_KEY 환경 변수가 설정되어 있는지 확인하세요.", err);
    return null;
  }
  const target = email.toLowerCase();
  const perPage = 1000;
  const maxPages = 50;
  for (let page = 1; page <= maxPages; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("[Supabase admin] listUsers 호출 실패:", error);
      return null;
    }
    const users = (data?.users ?? []) as Array<{ email?: string | null; email_confirmed_at?: string | null }>;
    if (users.length === 0) return "not_found";
    const matched = users.find((u) => u.email?.toLowerCase() === target);
    if (matched) return matched.email_confirmed_at ? "confirmed" : "unconfirmed";
    if (users.length < perPage) return "not_found";
  }
  return "not_found";
}

export type UserIdentitySummary = { found: false } | { found: true; confirmed: boolean; hasPassword: boolean; oauthProviders: string[] };

/**
 * 이메일에 연결된 사용자의 인증 수단 요약.
 * - `found`: 가입 여부
 * - `confirmed`: `email_confirmed_at`이 설정되어 있는지 (OAuth 가입자는 즉시 true)
 * - `hasPassword`: identity.provider === "email"인 row가 있는지 (= 비밀번호 로그인 가능)
 * - `oauthProviders`: ["kakao", "google", ...] OAuth 공급자 이름 배열
 *
 * listUsers로 user.id를 찾은 뒤 getUserById로 identities를 다시 조회한다.
 * listUsers 응답은 identities를 빈 배열/undefined로 돌려주는 경우가 있어
 * 그대로 사용하면 provider 분기가 항상 fallback으로 빠짐.
 *
 * 호출당 listUsers 풀 스캔 + 매칭 1건의 getUserById가 들어가므로 같은 액션에서 두 번 호출하지 말 것.
 * 실패(서비스 키 누락/네트워크) 시 null — 호출 측에서 "일시적 오류" 메시지로 분기.
 */
export async function getUserIdentitySummary(email: string): Promise<UserIdentitySummary | null> {
  let admin;
  try {
    admin = createAdminClient();
  } catch (err) {
    console.error("[Supabase admin] admin client 생성 실패. SUPABASE_SERVICE_ROLE_KEY 환경 변수가 설정되어 있는지 확인하세요.", err);
    return null;
  }
  const target = email.toLowerCase();
  const perPage = 1000;
  const maxPages = 50;
  for (let page = 1; page <= maxPages; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("[Supabase admin] listUsers 호출 실패:", error);
      return null;
    }
    const users = (data?.users ?? []) as Array<{ id: string; email?: string | null }>;
    if (users.length === 0) return { found: false };
    const matched = users.find((u) => u.email?.toLowerCase() === target);
    if (matched) {
      const { data: detail, error: detailErr } = await admin.auth.admin.getUserById(matched.id);
      if (detailErr || !detail?.user) {
        console.error("[Supabase admin] getUserById 호출 실패:", detailErr);
        return null;
      }
      const identities = (detail.user.identities ?? []) as Array<{ provider?: string | null }>;
      let hasPassword = false;
      const oauthProviders: string[] = [];
      for (const id of identities) {
        const provider = id.provider;
        if (!provider) continue;
        if (provider === "email") {
          hasPassword = true;
        } else if (!oauthProviders.includes(provider)) {
          oauthProviders.push(provider);
        }
      }
      return { found: true, confirmed: !!detail.user.email_confirmed_at, hasPassword, oauthProviders };
    }
    if (users.length < perPage) return { found: false };
  }
  return { found: false };
}
