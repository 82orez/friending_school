-- 월간 정산 확정을 센터 단위로 전환. 정산은 센터별로 진행(각 센터가 선 정산받은 뒤 소속 강사에게 지급)이므로,
-- 확정 대상 = 센터 × 월(소속 강사들의 진행 수업 합계). 직전 강사별 원장(teacher_settlements)은 폐기.
drop table if exists public.teacher_settlements;

create table if not exists public.center_settlements (
  id uuid primary key default gen_random_uuid(),
  center_id uuid references public.centers (id) on delete set null,
  center_name text, -- 스냅샷(센터 삭제 후에도 원장 보존)
  period_month text not null, -- 'YYYY-MM' (KST 기준 정산 월)
  -- 확정 시점 스냅샷(서버 재계산값):
  sessions_count int not null default 0,
  currency text, -- 센터 지급 통화(native 기본액 표시용)
  base_amount numeric(14, 2), -- 지급 통화 native 기본 정산액
  base_krw numeric(14, 2) not null default 0, -- 기본 정산액의 원화 환산(확정 시점 날짜별 환율)
  base_native jsonb not null default '{}', -- 통화→금액(다통화 대비)
  -- 조정/실지급:
  adjustments jsonb not null default '[]', -- [{label, amount, currency, krw}] (krw=확정 시점 환율 스냅샷, 부호 있음)
  total_krw numeric(14, 2) not null default 0, -- 실지급액(원화) = base_krw + Σadj.krw, 수기 override 값
  -- 상태/감사:
  status text not null default '확정' check (status in ('확정', '지급완료')),
  note text,
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz not null default now(),
  paid_at date, -- 지급완료 시 송금일
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (center_id, period_month)
);

create index if not exists center_settlements_month_idx on public.center_settlements (period_month);
create index if not exists center_settlements_center_idx on public.center_settlements (center_id, period_month);

alter table public.center_settlements enable row level security;
-- 정책 없음 = service_role만(admin action이 createAdminClient로 조회/쓰기).

create trigger center_settlements_set_updated_at before update on public.center_settlements
  for each row execute function public.tg_set_updated_at();
