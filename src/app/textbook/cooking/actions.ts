"use server";

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { COOKING_COURSE, COOKING_TOTAL_UNITS } from "@/data/textbook/cooking";

export async function saveScrollProgress(course: string, unit: number, percent: number, completed: boolean) {
  if (course !== COOKING_COURSE) return;
  if (!Number.isInteger(unit) || unit < 1 || unit > COOKING_TOTAL_UNITS) return;
  if (!Number.isFinite(percent)) return;
  const clampedPercent = Math.max(0, Math.min(100, Math.round(percent)));

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // 기존 row의 completed가 true면 유지 (한 번 완료한 unit은 false로 되돌리지 않음)
  const { data: existing } = await supabase
    .from("reading_progress")
    .select("completed")
    .eq("user_id", user.id)
    .eq("course", course)
    .eq("unit", unit)
    .maybeSingle();

  const finalCompleted = (existing?.completed ?? false) || completed;

  await supabase.from("reading_progress").upsert(
    {
      user_id: user.id,
      course,
      unit,
      scroll_percent: clampedPercent,
      completed: finalCompleted,
      last_viewed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,course,unit" },
  );
}
