"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getUserRole } from "@/lib/auth";
import { formatRetryAfter, getClientIp, rateLimit } from "@/lib/rate-limit";
import { getAdminEmails } from "@/utils/supabase/admin";
import { sendTeacherApplicationNotification } from "@/lib/mailer";
import { isValidZoomUrl } from "@/lib/url";

export type TeacherApplyState = { error?: string; success?: boolean };

// 강사 지원 저장. 가드 순서: (1) 로그인 (2) role 확인 (3) 필수값 (4) rateLimit (5) 중복 신청 (6) insert.
// user_id는 서버에서 getUser()로 주입(클라 위조 차단). RLS insert 정책(user_id=auth.uid())도 이중 보호.
export async function submitTeacherApplication(_prev: TeacherApplyState, formData: FormData): Promise<TeacherApplyState> {
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const name = [firstName, lastName].filter(Boolean).join(" ");
  const phone = String(formData.get("phone") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const experience = String(formData.get("experience") ?? "").trim();
  const zoomUrl = String(formData.get("zoom_url") ?? "").trim();
  const avatarUrl = String(formData.get("avatar_url") ?? "").trim();

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in first." };

  const role = await getUserRole(supabase, user.id);
  if (role === "teacher" || role === "admin") return { error: "This account already has teacher access." };

  if (!firstName || !lastName) return { error: "Please enter both your first and last name." };
  if (phone && !/^[0-9\-\s]{7,}$/.test(phone)) return { error: "Please enter a valid phone number." };
  if (bio.length < 10) return { error: "Please write at least 10 characters for your bio." };
  if (!experience) return { error: "Please enter your teaching and related experience." };
  if (!isValidZoomUrl(zoomUrl)) return { error: "Please enter a valid Zoom URL. (must start with http:// or https://)" };
  // 아바타 필수 + 본인 폴더(avatars/<uid>/)의 공개 URL인지 검증.
  if (!avatarUrl) return { error: "Please upload a profile photo." };
  if (!avatarUrl.includes(`/avatars/${user.id}/`)) return { error: "Invalid image path." };

  const ip = getClientIp(await headers());
  const rl = rateLimit(`teacher-apply:${ip}`, 5, 10 * 60_000);
  if (!rl.allowed) return { error: `Too many requests. Please try again in ${formatRetryAfter(rl.retryAfterSec)}.` };

  // 이미 심사 중('신청')인 지원이 있으면 차단 (부분 유니크 인덱스로 이중 보호).
  const { data: pending } = await supabase.from("teacher_applications").select("id").eq("user_id", user.id).eq("status", "신청").maybeSingle();
  if (pending) return { error: "You already have an application under review." };

  const { error } = await supabase.from("teacher_applications").insert({
    user_id: user.id,
    name,
    first_name: firstName,
    last_name: lastName,
    phone: phone || null,
    bio,
    experience,
    zoom_url: zoomUrl,
    avatar_url: avatarUrl,
  });
  if (error) return { error: "Something went wrong while saving your application. Please try again later." };

  // 관리자 알림 메일 (best-effort) — 실패해도 지원 성공에는 영향 없음.
  try {
    const adminEmails = await getAdminEmails();
    await sendTeacherApplicationNotification(adminEmails, {
      name,
      phone,
      bio,
      experience,
      zoomUrl,
      email: user.email ?? "",
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[submitTeacherApplication] 관리자 알림 발송 실패:", err);
  }

  revalidatePath("/mypage");
  return { success: true };
}
