// 강사 국적 단일 소스 — 신청폼·프로필 폼·서버 검증·admin 표시가 모두 참조.
// 저장 값은 한국어 국가명 문자열(name), 국기(flag)는 표시 전용. 선택지 변경은 이 배열만 수정.
export const NATIONALITIES = [
  { name: "대한민국", flag: "🇰🇷" },
  { name: "미국", flag: "🇺🇸" },
  { name: "캐나다", flag: "🇨🇦" },
  { name: "영국", flag: "🇬🇧" },
  { name: "아일랜드", flag: "🇮🇪" },
  { name: "호주", flag: "🇦🇺" },
  { name: "뉴질랜드", flag: "🇳🇿" },
  { name: "남아프리카 공화국", flag: "🇿🇦" },
  { name: "필리핀", flag: "🇵🇭" },
] as const;

export const NATIONALITY_NAMES: string[] = NATIONALITIES.map((n) => n.name);

// 저장된 국가명 → "국기 국가명" 표시 문자열(미설정/미일치 시 "-").
export function nationalityLabel(name?: string | null): string {
  const found = NATIONALITIES.find((n) => n.name === name);
  return found ? `${found.flag} ${found.name}` : "-";
}
