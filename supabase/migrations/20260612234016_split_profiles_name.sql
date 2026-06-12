-- 강사 이름을 first_name / last_name로 분리 (원어민 강사 위주 + admin 성 기준 정렬/검색)
-- - profiles에 first_name / last_name 컬럼 추가
-- - 기존 full_name에서 백필 (마지막 공백 기준 split: 앞=first, 뒤 토큰=last)
-- - full_name 컬럼은 비파괴 보존 (drop하지 않음, 앱에서는 사용 중단)

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text;

-- 기존 full_name 백필: 공백 있으면 마지막 토큰을 last_name, 나머지를 first_name.
-- 공백 없으면 전체를 first_name(예: 한국 단일 이름)으로.
update public.profiles
set
  first_name = case when full_name ~ '\s' then trim(regexp_replace(trim(full_name), '^(.*)\s+\S+$', '\1')) else trim(full_name) end,
  last_name = case when full_name ~ '\s' then regexp_replace(trim(full_name), '^.*\s+(\S+)$', '\1') else null end
where full_name is not null and trim(full_name) <> '' and first_name is null and last_name is null;
