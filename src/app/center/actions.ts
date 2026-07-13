"use server";

import { createAdminClient } from "@/utils/supabase/admin";
import { requireCenterManager } from "@/lib/center-manager";
import { reassignClassCore } from "@/lib/reassign";

export type ActionResult = { ok: boolean; error?: string };

// 센터 매니저의 개별 회차 강사 대체 — 담당 센터 소속 강사 간에만 허용(공유 코어에 센터 제약 전달).
export async function centerReassignClass(classId: string, newTeacherId: string): Promise<ActionResult> {
  const mgr = await requireCenterManager();
  if (!mgr) return { ok: false, error: "권한이 없습니다." };
  return reassignClassCore(createAdminClient(), {
    classId,
    newTeacherId,
    actor: { id: mgr.userId, role: "center_manager" },
    constrainCenterIds: mgr.centerIds,
  });
}
