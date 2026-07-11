-- 정산 단가 적용일 이력. 센터·강사 개별 단가를 effective_from 이력으로 관리,
-- 정산은 수업 날짜(session_date) 기준으로 그 시점 유효 단가를 역산.
-- centers.price_per_session·profiles.custom_price_per_session는 "현재값 캐시"로 존치(이력 변경 시 동기화).
create table if not exists public.rate_schedules (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('center', 'teacher')),
  scope_id uuid not null, -- center_id 또는 teacher(auth.users.id)
  price_per_session numeric(12, 2), -- null = (teacher) 이 날짜부터 센터 단가 사용 / (center) 미설정
  currency text, -- price 있을 때만
  effective_from date not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rate_schedules_scope_idx on public.rate_schedules (scope, scope_id, effective_from desc);

alter table public.rate_schedules enable row level security;
-- 정책 없음 = service_role만(정산·admin page가 createAdminClient로 조회/쓰기).

create trigger rate_schedules_set_updated_at before update on public.rate_schedules
  for each row execute function public.tg_set_updated_at();

-- 백필: 기존 현재값을 아주 이른 적용일로 이관 → 모든 과거 수업 커버(도입 즉시 값 불변).
insert into public.rate_schedules (scope, scope_id, price_per_session, currency, effective_from)
  select 'center', id, price_per_session, coalesce(price_currency, 'KRW'), date '2000-01-01'
  from public.centers
  where price_per_session is not null;

insert into public.rate_schedules (scope, scope_id, price_per_session, currency, effective_from)
  select 'teacher', id, custom_price_per_session, coalesce(custom_price_currency, 'KRW'), date '2000-01-01'
  from public.profiles
  where custom_price_per_session is not null;
