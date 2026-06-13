"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

export type StudentActionState = { ok?: boolean; error?: string };

// 빈 문자열은 null로 저장, 길이 제한 적용.
function clean(value: FormDataEntryValue | null, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

// 학생 본인 이름·전화번호 저장. 본인 세션 client로 update —
// RLS(profiles_update_own)가 본인 row만 허용하고 role 트리거가 escalation을 차단하므로 service_role 불필요.
export async function updateStudentProfile(_prev: StudentActionState, formData: FormData): Promise<StudentActionState> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const name = clean(formData.get("name"), 40);
  const phone = clean(formData.get("phone"), 30);

  // 화이트리스트: first_name·phone만 갱신(role 등 미포함).
  const { error } = await supabase.from("profiles").update({ first_name: name, phone }).eq("id", user.id);
  if (error) return { error: "저장 중 문제가 발생했어요." };

  revalidatePath("/mypage");
  return { ok: true };
}
