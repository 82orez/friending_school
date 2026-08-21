-- 연습방 노쇼 처리 — 입장 시각 기록 + 자리 자동 회수.
--
-- 지금까지는 예약자가 나타나지 않아도 참가 행이 방이 끝날 때까지 정원 1칸을 계속 점유했다
-- (정원 하한이 1명이라 1:1 방은 노쇼 하나로 통째로 막힌다).
-- → 입장 시각을 남기고, "시작 + 유예(10분)까지 미입장"이면 정원 카운트에서 제외한다.
--
-- 참가 행은 지우지 않는다: ① 노쇼 기록이 남아야 하고 ② 늦게라도 입장은 허용하는 정책이라
-- (그 사이 다른 사람이 예약했다면 실제 인원이 정원을 1명 넘을 수 있다 — 의도된 트레이드오프).
alter table public.friender_room_participants add column if not exists entered_at timestamptz;

-- 참여 RPC 재선언 — 정원 검사를 "자리를 실제로 잡고 있는 사람" 기준으로 바꾼다.
-- 나머지 정의는 20260820220759 그대로(plpgsql은 부분 수정이 안 돼 본문을 통째로 다시 쓴다).
--
-- ⚠️ 유예 10분이 이 함수와 앱(src/lib/room-time.ts의 NO_SHOW_GRACE_MIN) 양쪽에 존재한다.
--    이 RPC는 authenticated에 grant돼 클라가 직접 호출할 수 있어 자급해야 하므로 불가피하다.
--    값을 바꿀 땐 반드시 두 곳을 함께 고칠 것.
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

  -- 입장했거나(entered_at sticky) 아직 유예 안에 있는 예약만 자리를 차지한 것으로 센다.
  select count(*) into v_count
  from public.friender_room_participants p
  where p.room_id = p_room_id
    and (
      p.entered_at is not null
      or now() < (v_room.session_date::timestamp + make_interval(mins => v_room.start_min + 10))
                   at time zone 'Asia/Seoul'
    );
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
