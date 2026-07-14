-- 월간 강사 정산 확정 원장. 매월 마감 후 강사별 지급액을 스냅샷·잠금하고,
-- 송금 수수료 등 조정 항목(항목별 통화)을 더한 실지급액(원화 환산 기준)을 기록.
-- 확정본은 이후 수업/단가/환율 변경에 영향받지 않는 불변 스냅샷(원장). 상태: 확정 → 지급완료.
create table if not exists public.teacher_settlements (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users (id) on delete cascade,
  period_month text not null, -- 'YYYY-MM' (KST 기준 정산 월)
  -- 확정 시점 스냅샷(서버 재계산값):
  sessions_count int not null default 0,
  currency text, -- 강사 지급 통화(native 기본액 표시용)
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
  unique (teacher_id, period_month)
);

create index if not exists teacher_settlements_month_idx on public.teacher_settlements (period_month);
create index if not exists teacher_settlements_teacher_idx on public.teacher_settlements (teacher_id, period_month);

alter table public.teacher_settlements enable row level security;
-- 정책 없음 = service_role만(admin action이 createAdminClient로 조회/쓰기).

create trigger teacher_settlements_set_updated_at before update on public.teacher_settlements
  for each row execute function public.tg_set_updated_at();
