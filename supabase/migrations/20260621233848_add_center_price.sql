-- 센터별 1회당 단가(원). nullable = 미설정 허용. admin 센터 관리에서 입력.
alter table public.centers add column if not exists price_per_session integer;
