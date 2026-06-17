import { createClient } from "@/utils/supabase/client";

const BUCKET = "avatars";

// 새 아바타 파일을 본인 폴더(avatars/<uid>/)에 업로드하고 publicUrl·path 반환.
// 파일명은 타임스탬프로 유니크(캐시 무효화). 정리는 cleanupOldAvatars 로 별도 수행.
export async function uploadAvatar(file: File, userId: string): Promise<{ publicUrl: string; path: string }> {
  const supabase = createClient();
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
  if (error) throw error;
  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { publicUrl, path };
}

// 본인 폴더에서 keepPath(방금 올린 파일)를 제외한 이전 파일을 삭제 — 버킷 누적 방지.
// best-effort: 실패해도 throw 하지 않음(업로드 성공 경험을 해치지 않기 위함).
export async function cleanupOldAvatars(userId: string, keepPath: string): Promise<void> {
  try {
    const supabase = createClient();
    const { data: list } = await supabase.storage.from(BUCKET).list(userId);
    const stale = (list ?? []).map((f) => `${userId}/${f.name}`).filter((p) => p !== keepPath);
    if (stale.length > 0) await supabase.storage.from(BUCKET).remove(stale);
  } catch {
    // 정리는 best-effort — 무시.
  }
}
