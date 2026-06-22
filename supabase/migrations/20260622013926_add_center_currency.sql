-- 센터 단가 통화. KRW(원)/PHP(페소) 중 선택, 기본 KRW. src/data/currencies.ts 단일 소스.
alter table public.centers add column if not exists price_currency text not null default 'KRW';
