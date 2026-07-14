-- 외화 환율 적용일 이력. 통화별 환율(1단위당 원)을 effective_from 이력으로 관리,
-- 정산(수업 진행일 session_date)·매출(결제일)은 그 시점 유효 환율로 원화 환산 → 시기별 환율 변동이 과거에 소급되지 않음.
-- settings.<code>_to_krw는 "현재값 캐시"로 존치(이력 변경 시 syncFxCache로 동기화 → 기존 현재값 소비처 무변경).
create table if not exists public.exchange_rate_schedules (
  id uuid primary key default gen_random_uuid(),
  currency text not null check (currency in ('PHP', 'USD')),
  rate_to_krw numeric(12, 4) not null check (rate_to_krw > 0), -- 외화 1단위당 원(₩)
  effective_from date not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (currency, effective_from)
);

create index if not exists exchange_rate_schedules_idx on public.exchange_rate_schedules (currency, effective_from desc);

alter table public.exchange_rate_schedules enable row level security;
-- 정책 없음 = service_role만(정산·매출·admin page가 createAdminClient로 조회/쓰기).

create trigger exchange_rate_schedules_set_updated_at before update on public.exchange_rate_schedules
  for each row execute function public.tg_set_updated_at();

-- 백필: 기존 settings 현재 환율을 아주 이른 적용일로 이관 → 모든 과거 수업/결제 커버(도입 즉시 값 불변).
insert into public.exchange_rate_schedules (currency, rate_to_krw, effective_from)
  select upper(split_part(key, '_', 1)), value::numeric, date '2000-01-01'
  from public.settings
  where key in ('php_to_krw', 'usd_to_krw') and coalesce(value, '0')::numeric > 0
  on conflict (currency, effective_from) do nothing;
