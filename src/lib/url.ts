// http/https URL 검증 (Zoom URL 등). 강사 프로필·강사 지원 폼에서 공유.
export function isValidZoomUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
