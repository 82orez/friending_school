-- 센터(학원) 관리 테이블 + 강사 신청서·프로필 FK. admin이 CRUD로 관리, 강사 신청폼에서 선택.
create table public.centers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index centers_sort_idx on public.centers (sort_order, created_at);

alter table public.centers enable row level security;
-- 공개 읽기(폼 드롭다운·표시). 쓰기 정책 없음 → admin service_role만.
create policy "centers_select_all" on public.centers for select to anon, authenticated using (true);

create trigger centers_set_updated_at before update on public.centers
  for each row execute function public.tg_set_updated_at();

insert into public.centers (name, sort_order) values ('Lani', 1), ('Sebu', 2);

-- 강사 신청서·프로필에 center_id FK(센터 삭제 시 해당 강사는 자동 NULL = "None").
alter table public.teacher_applications add column if not exists center_id uuid references public.centers(id) on delete set null;
alter table public.profiles add column if not exists center_id uuid references public.centers(id) on delete set null;

-- 승인 RPC 재선언 — 기존 nationality·gender 줄 유지 + center_id coalesce 추가.
create or replace function public.approve_teacher_application(p_app_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app public.teacher_applications%rowtype;
  v_role public.user_role;
begin
  select * into v_app from public.teacher_applications where id = p_app_id for update;
  if not found then
    return 'not_found';
  end if;
  if v_app.status <> '신청' then
    return 'not_pending';
  end if;

  select role into v_role from public.profiles where id = v_app.user_id for update;
  if v_role = 'admin' then
    return 'is_admin';
  end if;

  -- 프로필 role 부여 + 신청서 내용으로 채움(필수는 항상, 선택은 신청서 값 있으면 덮어쓰고 없으면 기존 유지).
  update public.profiles set
    role        = 'teacher',
    first_name  = coalesce(nullif(v_app.first_name, ''), v_app.name),
    last_name   = coalesce(v_app.last_name, ''),
    bio         = coalesce(v_app.bio, ''),
    experience  = coalesce(v_app.experience, experience),
    phone       = coalesce(v_app.phone, phone),
    zoom_url    = coalesce(v_app.zoom_url, zoom_url),
    avatar_url  = coalesce(v_app.avatar_url, avatar_url),
    nationality = coalesce(v_app.nationality, nationality),
    gender      = coalesce(v_app.gender, gender),
    center_id   = coalesce(v_app.center_id, center_id)
  where id = v_app.user_id;

  -- JWT 일관성 위해 app_metadata.role 동기.
  update auth.users
    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'teacher')
    where id = v_app.user_id;

  update public.teacher_applications set status = '승인' where id = p_app_id;

  return 'ok';
end;
$$;

grant execute on function public.approve_teacher_application(uuid) to service_role;
