-- 회원 Role 시스템 도입
-- - public.profiles 테이블 생성 (id FK → auth.users)
-- - user_role ENUM ('admin' | 'teacher' | 'student')
-- - 신규 가입 시 student role 자동 부여 trigger
-- - auth.users.raw_app_meta_data.role 동기화
-- - 기존 가입자 backfill

-- 1) ENUM 타입
create type public.user_role as enum ('admin', 'teacher', 'student');

-- 2) profiles 테이블
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'student',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3) RLS 활성화 + 최소 정책
alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);
-- INSERT/DELETE 정책 없음 → trigger와 service_role만 가능

-- 4) 신규 가입 자동 처리 trigger
-- SECURITY DEFINER로 auth.users 쓰기 권한 확보
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'student')
  on conflict (id) do nothing;

  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'student')
  where id = new.id;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5) updated_at 자동 갱신
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.tg_set_updated_at();

-- 6) 기존 가입자 backfill
insert into public.profiles (id, role)
select id, 'student' from auth.users
on conflict (id) do nothing;

update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'student')
where raw_app_meta_data->>'role' is null;
