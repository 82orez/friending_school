-- 프렙 회차 20행 교체 — 강좌 수정에서 쓴다.
--
-- 왜 RPC인가:
--   ① prep_sessions에 unique(course_id, session_date)가 걸려 있어 순차 update로는
--      1강↔2강처럼 날짜를 맞바꿀 때 중간 상태에서 충돌한다.
--   ② PostgREST에는 트랜잭션이 없어 delete → insert 사이에 실패하면 '회차 0개 강좌'가 남는다.
--   → 한 트랜잭션 안에서 delete + insert를 끝내는 함수로 처리한다(join_friender_room과 같은 패턴).
--
-- ⚠️ 이 함수는 auth.uid()로 소유권을 자체 검증한다 → 반드시 **세션 client**로 호출할 것.
--    service_role로 부르면 auth.uid()가 null이라 항상 'unauthenticated'로 거부된다.
create or replace function public.replace_prep_sessions(p_course_id uuid, p_dates date[], p_topics text[])
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_uid uuid := auth.uid();
  v_len int := coalesce(array_length(p_dates, 1), 0);
  i int;
begin
  if v_uid is null then
    return 'unauthenticated';
  end if;

  -- 같은 강좌에 대한 동시 수정을 직렬화한다.
  select friender_id into v_owner from public.prep_courses where id = p_course_id for update;
  if not found then
    return 'not_found';
  end if;
  if v_owner <> v_uid then
    return 'forbidden';
  end if;

  if v_len = 0 or v_len is distinct from coalesce(array_length(p_topics, 1), 0) then
    return 'length_mismatch';
  end if;

  delete from public.prep_sessions where course_id = p_course_id;

  for i in 1..v_len loop
    insert into public.prep_sessions (course_id, session_no, session_date, topic)
    values (p_course_id, i, p_dates[i], p_topics[i]);
  end loop;

  return 'ok';
end;
$$;

revoke all on function public.replace_prep_sessions(uuid, date[], text[]) from public;
grant execute on function public.replace_prep_sessions(uuid, date[], text[]) to authenticated;
