-- 연습방 참가자 — 일반 회원이 /friending에서 방에 참여한 기록.
-- capacity는 "개설자를 제외한 참가자 정원"으로 해석한다(프렌더는 호스트라 슬롯을 먹지 않음).
create table if not exists public.friender_room_participants (
  room_id uuid not null references public.friender_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- 표시 스냅샷: profiles_select_own RLS로 타인 profiles를 읽을 수 없어 필요(classes 패턴).
  user_name text,
  created_at timestamptz not null default now(),
  primary key (room_id, user_id) -- 중복 참여 원천 차단
);

create index if not exists friender_room_participants_user_idx on public.friender_room_participants (user_id);

alter table public.friender_room_participants enable row level security;

-- 본인 참여 내역만 조회. 누가 참여했는지는 공개하지 않는다
-- (목록의 참여 인원 카운트는 서버 컴포넌트가 service_role로 집계).
create policy "friender_room_participants_select_own" on public.friender_room_participants
  for select to authenticated
  using (auth.uid() = user_id);

-- 사용자 INSERT/UPDATE/DELETE 정책 없음 — 참여=아래 RPC, 취소=service_role 액션.

-- 참여 처리(원자적). 정원 검사와 insert 사이의 경쟁 조건을 막기 위해 방 행을 for update로 잠가
-- 같은 방에 대한 동시 요청을 직렬화한다(approve_friender_application과 동일한 RPC 패턴).
create or replace function public.join_friender_room(p_room_id uuid, p_user_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.friender_rooms%rowtype;
  v_count int;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return 'unauthenticated';
  end if;

  select * into v_room from public.friender_rooms where id = p_room_id for update;
  if not found then
    return 'not_found';
  end if;
  if not v_room.is_visible then
    return 'not_visible';
  end if;
  if v_room.friender_id = v_uid then
    return 'own_room';
  end if;

  -- ⚠️ 앱은 보통 KST 비교를 SQL에 두지 않지만(조회 측 JS 필터), 이 함수는 authenticated에
  --    grant되어 클라가 직접 호출할 수 있으므로 종료 판정까지 자급해야 한다.
  if (v_room.session_date::timestamp + make_interval(mins => v_room.start_min + v_room.duration_min))
       at time zone 'Asia/Seoul' <= now() then
    return 'ended';
  end if;

  if exists (select 1 from public.friender_room_participants where room_id = p_room_id and user_id = v_uid) then
    return 'already';
  end if;

  select count(*) into v_count from public.friender_room_participants where room_id = p_room_id;
  if v_count >= v_room.capacity then
    return 'full';
  end if;

  insert into public.friender_room_participants (room_id, user_id, user_name)
    values (p_room_id, v_uid, p_user_name);

  return 'ok';
end;
$$;

revoke all on function public.join_friender_room(uuid, text) from public;
grant execute on function public.join_friender_room(uuid, text) to authenticated;
