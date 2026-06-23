// 전화번호 정규화·검증·표시. 클라(폼)·서버(액션) 공유.

// 숫자만 추출(하이픈·공백 제거).
export function normalizePhone(raw: string | null | undefined): string {
  return String(raw ?? "").replace(/\D/g, "");
}

// 한국 휴대폰 번호 검증(010/011/016/017/018/019 + 7~8자리).
export function isValidKoreanMobile(digits: string): boolean {
  return /^01[016789]\d{7,8}$/.test(digits);
}

// 표시용 하이픈(예: 010-1234-5678). 형식 밖이면 원본 반환.
export function formatPhone(raw: string | null | undefined): string {
  const d = normalizePhone(raw);
  if (/^01[016789]\d{8}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (/^01[016789]\d{7}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return raw ?? "";
}
