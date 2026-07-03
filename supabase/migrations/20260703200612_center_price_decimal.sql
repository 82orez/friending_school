-- 센터 회당 단가를 정수 → numeric으로 확장. USD 단가를 소수 첫째자리까지 입력·저장하기 위함.
-- KRW/PHP는 앱에서 정수로 정규화하므로 실동작 불변, USD만 소수 1자리 허용(numeric은 여유롭게 (12,2)).
alter table public.centers
  alter column price_per_session type numeric(12, 2) using price_per_session::numeric;
