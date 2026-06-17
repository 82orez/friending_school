-- 강사 지원 승인을 단일 트랜잭션으로 처리하는 RPC.
-- role 부여(profiles + auth.users app_metadata) + 프로필 채움 + 신청 상태 변경을 원자적으로 수행.
-- 상태 가드: '신청'이 아니면 처리하지 않음(재승인 시 강사가 수정한 프로필 덮어쓰기 방지).
-- service_role(admin 액션)에서 호출. SECURITY DEFINER라 prevent_role_self_change 트리거 통과(current_user=postgres).
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
    role       = 'teacher',
    first_name = coalesce(nullif(v_app.first_name, ''), v_app.name),
    last_name  = coalesce(v_app.last_name, ''),
    bio        = coalesce(v_app.bio, ''),
    experience = coalesce(v_app.experience, experience),
    phone      = coalesce(v_app.phone, phone),
    zoom_url   = coalesce(v_app.zoom_url, zoom_url),
    avatar_url = coalesce(v_app.avatar_url, avatar_url)
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
