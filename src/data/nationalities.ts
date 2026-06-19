// 강사 국적 단일 소스 — 신청폼·프로필 폼·서버 검증·admin 표시가 모두 참조.
// 저장 값은 한국어 국가명 문자열(name=검증 키), 국기(flag)·영문명(en)은 표시 전용.
// 강사용 폼(영문 UI)은 en, admin(한국어 UI)은 name으로 표시. 선택지 변경은 이 배열만 수정.
export const NATIONALITIES = [
  { name: "대한민국", en: "Korea", flag: "🇰🇷" },
  { name: "필리핀", en: "Philippines", flag: "🇵🇭" },
  { name: "미국", en: "United States", flag: "🇺🇸" },
  { name: "캐나다", en: "Canada", flag: "🇨🇦" },
  { name: "영국", en: "United Kingdom", flag: "🇬🇧" },
  { name: "아일랜드", en: "Ireland", flag: "🇮🇪" },
  { name: "호주", en: "Australia", flag: "🇦🇺" },
  { name: "뉴질랜드", en: "New Zealand", flag: "🇳🇿" },
  { name: "남아프리카 공화국", en: "South Africa", flag: "🇿🇦" },
] as const;

export const NATIONALITY_NAMES: string[] = NATIONALITIES.map((n) => n.name);

// 저장된 국가명 → "국기 한국어명" 표시(admin, 미설정/미일치 시 "-").
export function nationalityLabel(name?: string | null): string {
  const found = NATIONALITIES.find((n) => n.name === name);
  return found ? `${found.flag} ${found.name}` : "-";
}

// 저장된 국가명 → "국기 영문명" 표시(강사용 폼·신청 플로우, 미설정/미일치 시 "-").
export function nationalityLabelEn(name?: string | null): string {
  const found = NATIONALITIES.find((n) => n.name === name);
  return found ? `${found.flag} ${found.en}` : "-";
}
