-- 프렌더 닉네임(nickname) 필드 추가. 신청폼·프렌더 프로필 공통, **선택 입력**(nullable).
-- 프렌더 본인이 /friender에서 수정 가능(이름·국적·성별과 달리 승인 시 확정되지 않음).
alter table public.friender_applications add column if not exists nickname text;
alter table public.profiles add column if not exists nickname text;

-- 승인 RPC 재선언 — profiles 채움 블록에 nickname coalesce 추가(nationality 등과 동일 패턴).
-- 나머지 내용(is_teacher 가드·bio=intro 매핑·phone 미갱신)은 20260811011714 정의 그대로 유지.
create or replace function public.approve_friender_application(p_app_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app public.friender_applications%rowtype;
  v_role public.user_role;
begin
  select * into v_app from public.friender_applications where id = p_app_id for update;
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
  -- role은 단일값이라 강사를 프렌더로 바꾸면 강사 데이터(수업·정산)가 고아가 됨 → 차단.
  if v_role = 'teacher' then
    return 'is_teacher';
  end if;

  -- 프로필 role 부여 + 신청서 내용으로 채움.
  -- intro(회원들에게 자신을 소개하기) → profiles.bio (범용 자기소개 컬럼).
  update public.profiles set
    role        = 'friender',
    first_name  = coalesce(nullif(v_app.first_name, ''), v_app.name),
    last_name   = coalesce(v_app.last_name, ''),
    nickname    = coalesce(v_app.nickname, nickname),
    bio         = v_app.intro,
    zoom_url    = coalesce(v_app.zoom_url, zoom_url),
    avatar_url  = coalesce(v_app.avatar_url, avatar_url),
    nationality = coalesce(v_app.nationality, nationality),
    gender      = coalesce(v_app.gender, gender)
  where id = v_app.user_id;
  -- ⚠️ phone은 갱신하지 않음: profiles.phone이 인증 원본이고 신청서 phone은 그 스냅샷이라
  --    되쓰면 phone_verified_at과의 정합이 깨질 여지가 있음.

  -- JWT 일관성 위해 app_metadata.role 동기.
  update auth.users
    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'friender')
    where id = v_app.user_id;

  update public.friender_applications set status = '승인' where id = p_app_id;

  return 'ok';
end;
$$;

grant execute on function public.approve_friender_application(uuid) to service_role;
