-- 강사 개별 정산 단가(센터 단가 오버라이드). 기본=소속 센터 단가, 설정 시 이 값 우선.
-- 둘 다 nullable·기본값 없음 = 미설정(=센터 단가 사용) 구분. src/data/currencies.ts 통화 단일 소스.
alter table public.profiles
  add column if not exists custom_price_per_session numeric(12, 2),
  add column if not exists custom_price_currency text;
