-- 결제 트랜잭션 기록(PortOne V2 카드 결제·환불). enrollment_events/enrollments 관례 그대로:
-- gen_random_uuid()·tg_set_updated_at·RLS(본인 select + 쓰기 service_role만).
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  payment_id text not null unique,                         -- PortOne paymentId (예: enroll-{enrollment}-{ts})
  enrollment_id uuid references public.enrollments(id) on delete set null,
  student_id uuid references auth.users(id) on delete set null,
  amount integer not null,                                  -- 결제 금액(원)
  currency text not null default 'KRW',
  status text not null default 'paid' check (status in ('paid', 'cancelled', 'partial_cancelled', 'failed')),
  cancelled_amount integer not null default 0,              -- 누적 환불 금액(원)
  pg_tx_id text,                                            -- PortOne transactionId
  method text,                                              -- 결제 수단(card 등)
  receipt_url text,                                         -- PortOne 영수증 URL
  raw jsonb,                                                -- PortOne 결제 객체 스냅샷
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payments_enrollment_idx on public.payments (enrollment_id);
create index payments_student_idx on public.payments (student_id, created_at desc);

alter table public.payments enable row level security;

-- 본인 결제만 조회(학생 결제내역용). INSERT/UPDATE/DELETE 사용자 정책 없음 = service_role만 쓰기.
create policy payments_select_own on public.payments
  for select using (auth.uid() = student_id);

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.tg_set_updated_at();
