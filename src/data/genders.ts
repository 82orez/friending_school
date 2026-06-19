// 강사 성별 단일 소스 — 신청폼·프로필 폼·서버 검증·admin 표시가 모두 참조.
// 저장 값은 코드(value: male/female), 폼(영문 UI)은 en, admin(한국어 UI)은 ko로 표시.
export const GENDERS = [
  { value: "male", ko: "남성", en: "Male" },
  { value: "female", ko: "여성", en: "Female" },
] as const;

// 서버 검증용 — literal union 회피 위해 string[] 명시(없으면 .includes(string) 빌드 실패).
export const GENDER_VALUES: string[] = GENDERS.map((g) => g.value);

// 저장 코드 → 영문 표시(폼·apply read-only, 미설정/미일치 시 "-").
export function genderLabelEn(value?: string | null): string {
  return GENDERS.find((g) => g.value === value)?.en ?? "-";
}

// 저장 코드 → 한국어 표시(admin, 미설정/미일치 시 "-").
export function genderLabelKo(value?: string | null): string {
  return GENDERS.find((g) => g.value === value)?.ko ?? "-";
}
