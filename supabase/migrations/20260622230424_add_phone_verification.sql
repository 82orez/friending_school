-- 학생 전화번호 SMS 인증(Solapi). 인증 통과 시에만 phone + phone_verified_at 기록.

-- 인증 시각(null=미인증).
alter table public.profiles add column if not exists phone_verified_at timestamptz;

-- OTP 챌린지(유저당 1행, 재전송=upsert 교체). 코드는 해시 저장. RLS enabled + 정책 없음 = service_role만 접근.
create table public.phone_verifications (
  user_id uuid primary key references auth.users(id) on delete cascade,
  phone text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts smallint not null default 0,
  last_sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.phone_verifications enable row level security;

-- phone/phone_verified_at 자가 변경 차단: profiles_update_own RLS엔 컬럼 제한이 없어
-- 브라우저 anon 클라가 phone_verified_at를 임의 set할 수 있으므로, service_role 외에는 되돌린다.
-- (prevent_role_self_change와 동일 패턴.)
create or replace function public.prevent_phone_self_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then
    new.phone := old.phone;
    new.phone_verified_at := old.phone_verified_at;
  end if;
  return new;
end;
$$;

create trigger prevent_phone_self_change
  before update on public.profiles
  for each row execute function public.prevent_phone_self_change();
