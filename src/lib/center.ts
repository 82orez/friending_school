import "server-only";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 폼의 center_id 입력 → 유효한 center id 또는 null. uuid 형식 + centers 테이블 존재 검증
// (빈 값/비uuid/미존재는 모두 null = "None"). FK 위반 에러를 방지하고 임의 값을 차단.
export async function resolveCenterId(supabase: { from: (t: string) => any }, raw: FormDataEntryValue | null): Promise<string | null> {
  const id = String(raw ?? "").trim();
  if (!id || !UUID_RE.test(id)) return null;
  const { data } = await supabase.from("centers").select("id").eq("id", id).maybeSingle();
  return data ? id : null;
}
