-- 프렌더 지원 승인을 단일 트랜잭션으로 처리하는 RPC (approve_teacher_application 미러).
-- role 부여(profiles + auth.users app_metadata) + 프로필 채움 + 신청 상태 변경을 원자적으로 수행.
-- 상태 가드: '신청'이 아니면 처리하지 않음(재승인 시 프렌더가 수정한 프로필 덮어쓰기 방지).
-- service_role(admin 액션)에서 호출. SECURITY DEFINER라 prevent_role_self_change 트리거 통과(current_user=postgres).
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
