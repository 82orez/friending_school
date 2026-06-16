"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getUserRole } from "@/lib/auth";
import { formatRetryAfter, getClientIp, rateLimit } from "@/lib/rate-limit";
import { getAdminEmails } from "@/utils/supabase/admin";
import { sendTeacherApplicationNotification } from "@/lib/mailer";

export type TeacherApplyState = { error?: string; success?: boolean };

// 강사 지원 저장. 가드 순서: (1) 로그인 (2) role 확인 (3) 필수값 (4) rateLimit (5) 중복 신청 (6) insert.
// user_id는 서버에서 getUser()로 주입(클라 위조 차단). RLS insert 정책(user_id=auth.uid())도 이중 보호.
export async function submitTeacherApplication(_prev: TeacherApplyState, formData: FormData): Promise<TeacherApplyState> {
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const headline = String(formData.get("headline") ?? "").trim();
  const intro = String(formData.get("intro") ?? "").trim();
  const experience = String(formData.get("experience") ?? "").trim();

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const role = await getUserRole(supabase, user.id);
  if (role === "teacher" || role === "admin") return { error: "이미 강사 권한이 있는 계정입니다." };

  if (name.length < 2) return { error: "이름을 정확히 입력해 주세요." };
  if (!/^[0-9\-\s]{7,}$/.test(phone)) return { error: "전화번호를 정확히 입력해 주세요." };
  if (intro.length < 10) return { error: "자기소개·지원 동기를 10자 이상 입력해 주세요." };

  const ip = getClientIp(await headers());
  const rl = rateLimit(`teacher-apply:${ip}`, 5, 10 * 60_000);
  if (!rl.allowed) return { error: `요청이 너무 많아요. ${formatRetryAfter(rl.retryAfterSec)} 다시 시도해 주세요.` };

  // 이미 심사 중('신청')인 지원이 있으면 차단 (부분 유니크 인덱스로 이중 보호).
  const { data: pending } = await supabase.from("teacher_applications").select("id").eq("user_id", user.id).eq("status", "신청").maybeSingle();
  if (pending) return { error: "이미 심사 중인 지원이 있습니다." };

  const { error } = await supabase.from("teacher_applications").insert({
    user_id: user.id,
    name,
    phone,
    headline: headline || null,
    intro,
    experience: experience || null,
  });
  if (error) return { error: "지원 저장 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요." };

  // 관리자 알림 메일 (best-effort) — 실패해도 지원 성공에는 영향 없음.
  try {
    const adminEmails = await getAdminEmails();
    await sendTeacherApplicationNotification(adminEmails, {
      name,
      phone,
      headline,
      intro,
      experience,
      email: user.email ?? "",
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[submitTeacherApplication] 관리자 알림 발송 실패:", err);
  }

  revalidatePath("/mypage");
  return { success: true };
}
