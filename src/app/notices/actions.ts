"use server";

import { createAdminClient } from "@/utils/supabase/admin";

// 공지 조회수 +1 — 인증 불필요(공개 페이지). service_role로 security definer RPC 호출,
// RPC 내부에서 공개(노출 ON·게시일 도래) 건만 증가시키므로 임의 id로 비공개 건을 건드릴 수 없다.
// 실패해도 열람 자체엔 영향 없어야 하므로 best-effort(예외 삼킴).
export async function recordNoticeView(id: string): Promise<void> {
  const noticeId = String(id ?? "").trim();
  if (!noticeId) return;
  try {
    await createAdminClient().rpc("increment_notice_view", { p_id: noticeId });
  } catch (err) {
    console.error("[recordNoticeView] 조회수 기록 실패:", err);
  }
}
