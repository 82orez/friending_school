-- 연습방 공개/비공개(is_visible) 폐지.
--
-- 이 컬럼은 notices·youtube_videos의 패턴을 그대로 가져온 것인데, 그 둘은 상시 콘텐츠라
-- "게시 취소"가 자연스러운 반면 방은 특정 시각에 열리고 끝나는 이벤트라 성격이 다르다.
-- 실제로 비공개는 "목록에서 사라지고 · 아무도(참가자·호스트조차) 입장 못 하고 · 겹침 검사에선
-- 슬롯을 계속 점유하는" 상태여서, 삭제보다 나은 점 없이 참가자를 조용히 락아웃시켰다.
-- → 방 취소는 삭제(참가자 행은 FK cascade로 정리)로 일원화한다.

-- 정책·인덱스가 컬럼을 참조하므로 먼저 걷어낸다(그냥 drop column 하면 의존성 에러).
drop policy if exists "friender_rooms_select_public" on public.friender_rooms;
drop index if exists public.friender_rooms_public_idx;

alter table public.friender_rooms drop column if exists is_visible;

-- 공개 읽기: 이제 조건 없음. 지난 방 필터는 조회 측 JS가 담당한다(기존과 동일).
create policy "friender_rooms_select_public" on public.friender_rooms
  for select to anon, authenticated
  using (true);

create index if not exists friender_rooms_public_idx on public.friender_rooms (session_date, start_min);

-- 참여 RPC 재선언 — not_visible 분기 제거. 나머지 정의는 20260820171938 그대로
-- (plpgsql은 런타임에 컬럼을 참조하므로 컬럼을 지우면 반드시 함께 갱신해야 한다).
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
