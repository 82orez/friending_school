"use server";

import { cookies, headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { isValidEmail } from "@/lib/email";
import { formatRetryAfter, getClientIp, rateLimit } from "@/lib/rate-limit";
import { getCourse } from "@/data/courses";
import { getAdminEmails } from "@/utils/supabase/admin";
import { sendApplicationNotification } from "@/lib/mailer";

export type ApplyState = { error?: string; success?: boolean };

// 과정 상담 신청 저장. 가드 순서: (1) 필수값 검증 (2) rateLimit (3) email 검증 (4) Supabase insert.
// user_id는 서버에서 getUser()로 주입(클라 위조 차단) — 비로그인은 null(익명 리드).
export async function submitApplication(_prev: ApplyState, formData: FormData): Promise<ApplyState> {
  const courseSlug = String(formData.get("courseSlug") ?? "");
  const option = String(formData.get("option") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const memo = String(formData.get("schedule") ?? "").trim();

  const course = getCourse(courseSlug);
  if (!course) return { error: "잘못된 과정입니다. 페이지를 새로고침해 주세요." };
  if (name.length < 2) return { error: "이름을 정확히 입력해 주세요." };
  if (!/^[0-9\-\s]{7,}$/.test(phone)) return { error: "전화번호를 정확히 입력해 주세요." };
  if (!option) return { error: "과정(수업 횟수)을 선택해 주세요." };
  if (!memo) return { error: "희망 날짜/시간을 입력해 주세요." };
  if (email && !isValidEmail(email)) return { error: "이메일 형식을 확인해 주세요." };

  const ip = getClientIp(await headers());
  const rl = rateLimit(`apply:${ip}`, 5, 10 * 60_000);
  if (!rl.allowed) return { error: `신청이 너무 많아요. ${formatRetryAfter(rl.retryAfterSec)} 다시 시도해 주세요.` };

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("applications").insert({
    user_id: user?.id ?? null,
    course: course.slug,
    course_title: course.title,
    option,
    name,
    phone,
    email: email || null,
    memo,
  });

  if (error) return { error: "신청 저장 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요." };

  // 관리자 알림 메일 (best-effort) — 실패해도 신청 성공에는 영향 없음.
  try {
    const adminEmails = await getAdminEmails();
    await sendApplicationNotification(adminEmails, {
      courseTitle: course.title,
      option,
      name,
      phone,
      email,
      memo,
      loggedIn: !!user,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[submitApplication] 관리자 알림 발송 실패:", err);
  }

  return { success: true };
}
