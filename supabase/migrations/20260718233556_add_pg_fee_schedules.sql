-- PG(결제대행) 수수료율 적용일 이력. 카드 등 PG 경유 결제에만 적용(무통장 입금 method='bank_transfer'는 0).
-- 매출 현황은 표시용 지표, 매출이익은 공급가액 − 정산 − PG 수수료로 차감.
-- 결제일(created_at KST) 기준 유효 율로 계산 → 율 변경이 과거 집계에 소급되지 않음(환율 이력과 동일 원칙).
-- rate_percent는 부가세 포함 총 청구율(예: 3.3).
create table if not exists public.pg_fee_schedules (
  id uuid primary key default gen_random_uuid(),
  rate_percent numeric(6, 3) not null check (rate_percent >= 0 and rate_percent < 100),
  effective_from date not null unique,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pg_fee_schedules_idx on public.pg_fee_schedules (effective_from desc);

alter table public.pg_fee_schedules enable row level security;
-- 정책 없음 = service_role만(매출/매출이익 로더·admin page가 createAdminClient로 조회/쓰기).

create trigger pg_fee_schedules_set_updated_at before update on public.pg_fee_schedules
  for each row execute function public.tg_set_updated_at();

-- 백필 없음: 이력이 비면 율 0 → 도입 시점 집계 불변, admin이 /admin/centers에서 첫 행 등록.
