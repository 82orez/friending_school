-- 승인 RPC 재선언 — friender_plus 가드 추가.
-- 기존 정의는 admin/teacher만 차단해서, friender_plus 계정이 통과하면 role을 'friender'로
-- 조용히 강등시킨다(신청 동선상 도달하기 어렵지만 방어). 나머지 내용은 20260811230643 정의 그대로.
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
  -- 상위 등급을 일반 프렌더로 덮어쓰지 않도록 차단(등급 변경은 admin의 setFrienderTier로만).
  if v_role = 'friender_plus' then
    return 'is_friender_plus';
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
