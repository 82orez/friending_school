/**
 * 서버 액션에서 이메일 형식을 검증하기 위한 가벼운 헬퍼.
 *
 * HTML `type="email"` 클라이언트 검증을 우회하는 요청(curl 등)이나, 공백/공격성 입력을 막기 위함.
 * RFC 5322를 완벽히 따르진 않지만 실용적으로 충분한 패턴:
 * 공백 없는 로컬파트 + `@` + 공백/`@` 없는 도메인 + `.` + TLD.
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}
