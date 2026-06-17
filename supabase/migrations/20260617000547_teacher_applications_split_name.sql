-- teacher_applications 의 이름을 first/last 로 분리.
-- 기존 단일 name 은 표시/검색/메일 호환을 위해 보존하고, 조합값으로 계속 채운다.
alter table public.teacher_applications
  add column if not exists first_name text,
  add column if not exists last_name text;

-- 기존 데이터 백필: 마지막 공백 기준 split (앞=first, 끝 토큰=last, 공백 없으면 전체=first).
update public.teacher_applications
set
  first_name = case when position(' ' in btrim(name)) > 0 then btrim(left(btrim(name), length(btrim(name)) - position(' ' in reverse(btrim(name))))) else btrim(name) end,
  last_name = case when position(' ' in btrim(name)) > 0 then right(btrim(name), position(' ' in reverse(btrim(name))) - 1) else null end
where first_name is null and name is not null;
