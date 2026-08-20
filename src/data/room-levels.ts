// 프렌더 연습방 난이도 단일 소스 — 개설 폼·서버 검증·목록 표시가 모두 참조.
// 저장 값은 코드(value), 표시는 ko. 프렌더 UI는 전부 한국어라 en은 두지 않는다.
// ⚠️ PG enum이 아닌 text + 앱 검증: enum은 값 추가 시 ALTER TYPE ADD VALUE 단독 마이그레이션이
//    강제되는데(user_role에서 겪음) 난이도는 늘어날 가능성이 크다.
export const ROOM_LEVELS = [
  { value: "any", ko: "누구나 환영" },
  { value: "beginner", ko: "왕초보 환영" },
  { value: "lower_int", ko: "초중급" },
  { value: "upper_int", ko: "중급 이상" },
] as const;

// 서버 검증용 — literal union 회피 위해 string[] 명시(없으면 .includes(string) 빌드 실패).
export const ROOM_LEVEL_VALUES: string[] = ROOM_LEVELS.map((l) => l.value);

export const DEFAULT_ROOM_LEVEL = "any";

export function roomLevelLabelKo(value?: string | null): string {
  return ROOM_LEVELS.find((l) => l.value === value)?.ko ?? "-";
}
