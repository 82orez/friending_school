-- 커스텀(테스트) 수강신청의 per-건 수강료(원). 실 수강신청은 null → COURSE_PRICE_KRW 전역 고정가로 폴백.
-- 유효가격 = price_krw ?? COURSE_PRICE_KRW (표시·무통장 입금확인·카드 검증·매출 단일 기준).
alter table public.enrollments add column if not exists price_krw integer;
