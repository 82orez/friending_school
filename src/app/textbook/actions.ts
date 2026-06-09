"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getTextbook } from "@/data/textbook";

// 사용자가 직접 학습 완료 여부를 토글(수동 완료 정책 — 스크롤 자동 판정 없음).
// 진입 가드 순서 고정: (1) course 레지스트리 화이트리스트 (2) unit 유효성 (3) getUser.
export async function setUnitCompleted(course: string, unit: number, completed: boolean) {
  const textbook = getTextbook(course);
  if (!textbook) return;
  if (!Number.isInteger(unit) || !textbook.units.some((u) => u.unit === unit)) return;

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("reading_progress").upsert(
    {
      user_id: user.id,
      course,
      unit,
      completed: !!completed,
      last_viewed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,course,unit" },
  );

  // 랜딩 셀프디벨롭·교재 목록의 완료 표시 동기화.
  revalidatePath("/");
  revalidatePath(`/textbook/${course}`);
}
