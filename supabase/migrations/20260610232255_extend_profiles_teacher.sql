-- 강사(teacher) 마이페이지용 profiles 확장 + role 자가변경 차단
-- - profiles에 프로필 컬럼 추가 (강사·향후 학생 공용)
-- - 사용자가 자기 role을 임의 변경하지 못하도록 트리거로 차단
--   (기존 profiles_update_own 정책에 WITH CHECK가 없어 잠재 권한상승 존재)

-- 1) 프로필 컬럼 추가
alter table public.profiles
  add column if not exists full_name text,
  add column if not exists avatar_url text,
  add column if not exists zoom_url text,
  add column if not exists bio text,
  add column if not exists headline text,
  add column if not exists phone text;

-- 2) role 자가변경 차단 트리거
-- security invoker(기본)라 current_user가 실제 호출 role을 반영:
--   authenticated(일반 사용자) → role 변경 시 OLD로 되돌림(무력화)
--   service_role(admin 액션) / postgres / supabase_admin → 통과
create or replace function public.prevent_role_self_change()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role
     and current_user not in ('service_role', 'postgres', 'supabase_admin') then
    new.role := old.role;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_role_self_change on public.profiles;
create trigger profiles_prevent_role_self_change
  before update on public.profiles
  for each row execute function public.prevent_role_self_change();
