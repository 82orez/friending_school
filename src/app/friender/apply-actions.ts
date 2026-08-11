"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getUserRole } from "@/lib/auth";
import { formatRetryAfter, getClientIp, rateLimit } from "@/lib/rate-limit";
import { getAdminEmails } from "@/utils/supabase/admin";
import { sendFrienderApplicationNotification } from "@/lib/mailer";
import { isValidZoomUrl } from "@/lib/url";
import { NATIONALITY_NAMES } from "@/data/nationalities";
import { GENDER_VALUES } from "@/data/genders";

// 성공은 리다이렉트로 알리므로 success 플래그가 없다(아래 제출 성공 처리 주석 참조).
export type FrienderApplyState = { error?: string };

// 프렌더 지원 저장. 가드 순서: (1) 로그인 (2) role 확인 (3) 필수값 (4) 전화 인증 (5) rateLimit (6) 중복 신청 (7) insert.
// user_id는 서버에서 getUser()로 주입(클라 위조 차단). RLS insert 정책(user_id=auth.uid())도 이중 보호.
// ⚠️ 전화번호는 폼 값을 쓰지 않고 profiles의 인증 완료 번호를 그대로 저장한다(인증 우회 차단).
export async function submitFrienderApplication(_prev: FrienderApplyState, formData: FormData): Promise<FrienderApplyState> {
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  // 한국 관례상 표시명은 성+이름을 공백 없이 붙임(학생 표시명 규칙과 동일).
  const name = `${lastName}${firstName}`;
  // 닉네임은 선택 입력 — 빈 값이면 null, 길이는 검증 실패 대신 잘라서 흡수.
  const nickname = String(formData.get("nickname") ?? "")
    .trim()
    .slice(0, 30);
  const nationality = String(formData.get("nationality") ?? "").trim();
  const gender = String(formData.get("gender") ?? "").trim();
  const intro = String(formData.get("intro") ?? "").trim();
  const zoomUrl = String(formData.get("zoom_url") ?? "").trim();
  const avatarUrl = String(formData.get("avatar_url") ?? "").trim();

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const role = await getUserRole(supabase, user.id);
  if (role === "friender") return { error: "이미 프렌더 권한이 있는 계정입니다." };
  if (role === "teacher") return { error: "강사 계정은 프렌더로 지원할 수 없습니다." };
  if (role === "admin") return { error: "관리자 계정은 프렌더로 지원할 수 없습니다." };

  if (!firstName || !lastName) return { error: "성과 이름을 모두 입력해 주세요." };
  if (!NATIONALITY_NAMES.includes(nationality)) return { error: "국적을 선택해 주세요." };
  if (!GENDER_VALUES.includes(gender)) return { error: "성별을 선택해 주세요." };
  if (intro.length < 10) return { error: "자기소개를 10자 이상 작성해 주세요." };
  if (!isValidZoomUrl(zoomUrl)) return { error: "올바른 Zoom URL을 입력해 주세요. (http:// 또는 https://로 시작)" };
  // 아바타 필수 + 본인 폴더(avatars/<uid>/)의 공개 URL인지 검증.
  if (!avatarUrl) return { error: "프로필 사진을 등록해 주세요." };
  if (!avatarUrl.includes(`/avatars/${user.id}/`)) return { error: "올바르지 않은 이미지 경로입니다." };

  // 전화번호 인증 확인 — 서버가 authoritative(클라 우회 방어). 저장 값도 여기서 읽은 인증 번호를 사용.
  const { data: profile } = await supabase.from("profiles").select("phone, phone_verified_at").eq("id", user.id).maybeSingle();
  const verifiedPhone = (profile as { phone?: string | null; phone_verified_at?: string | null } | null) ?? null;
  if (!verifiedPhone?.phone || !verifiedPhone.phone_verified_at) return { error: "전화번호 인증을 완료해 주세요." };

  const ip = getClientIp(await headers());
  const rl = rateLimit(`friender-apply:${ip}`, 5, 10 * 60_000);
  if (!rl.allowed) return { error: `요청이 너무 많습니다. ${formatRetryAfter(rl.retryAfterSec)} 다시 시도해 주세요.` };

  // 이미 심사 중('신청')인 지원이 있으면 차단 (부분 유니크 인덱스로 이중 보호).
  const { data: pending } = await supabase.from("friender_applications").select("id").eq("user_id", user.id).eq("status", "신청").maybeSingle();
  if (pending) return { error: "이미 심사 중인 신청이 있습니다." };

  const { error } = await supabase.from("friender_applications").insert({
    user_id: user.id,
    name,
    first_name: firstName,
    last_name: lastName,
    nickname: nickname || null,
    phone: verifiedPhone.phone,
    nationality,
    gender,
    intro,
    zoom_url: zoomUrl,
    avatar_url: avatarUrl,
  });
  if (error) return { error: "신청서를 저장하는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요." };

  // 관리자 알림 메일 (best-effort) — 실패해도 지원 성공에는 영향 없음.
  try {
    const adminEmails = await getAdminEmails();
    await sendFrienderApplicationNotification(adminEmails, {
      name,
      nickname,
      phone: verifiedPhone.phone,
      intro,
      zoomUrl,
      email: user.email ?? "",
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[submitFrienderApplication] 관리자 알림 발송 실패:", err);
  }

  revalidatePath("/friender/apply");
  // 제출 성공은 리다이렉트로 알린다 — 재검증되면 페이지가 '심사 중' 분기로 바뀌며 폼이 언마운트돼
  // 폼 내부 useEffect 토스트가 실행되지 못하기 때문(살아남는 페이지가 ToastOnMount로 표시).
  // ⚠️ redirect()는 NEXT_REDIRECT를 throw하므로 반드시 위 try/catch 바깥에서 호출할 것.
  redirect("/friender/apply?submitted=1");
}
