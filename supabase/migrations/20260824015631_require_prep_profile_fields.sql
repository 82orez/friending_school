-- 프렙 수강신청 자격에 **프로필 필수 항목**을 추가한다(성·이름·영어 이름).
--
-- 왜: 신청 명단이 관리자·프렌더에게 "(이름 없음)"으로 남으면 입금 대조와 수업 운영이 안 된다.
-- 영어 이름은 수업에서 부르는 이름이라 함께 받는다(기존 정규 수강신청도 english_name을 요구한다).
--
-- ⚠️ 시그니처는 그대로 유지한다 — 인자를 바꾸면 오버로드가 생겨 옛 버전이 authenticated에 grant된 채 남는다.
--    나머지 로직은 20260824001559 그대로이고, phone 검사 뒤에 이름 검사만 추가됐다.
create or replace function public.join_prep_course(p_course_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course public.prep_courses%rowtype;
  v_uid uuid := auth.uid();
  v_first date;
  v_last date;
  v_sessions int;
  v_count int;
  v_first_name text;
  v_last_name text;
  v_english_name text;
  v_nickname text;
  v_phone text;
  v_verified timestamptz;
  v_name text;
begin
  if v_uid is null then
    return 'unauthenticated';
  end if;

  select * into v_course from public.prep_courses where id = p_course_id for update;
  if not found then
    return 'not_found';
  end if;
  if v_course.status <> '승인' then
    return 'not_approved';
  end if;
  if v_course.friender_id = v_uid then
    return 'own_course';
  end if;

  if exists (
    select 1 from public.prep_enrollments
    where course_id = p_course_id and user_id = v_uid and status <> '취소'
  ) then
    return 'already';
  end if;

  select first_name, last_name, english_name, nickname, phone, phone_verified_at
    into v_first_name, v_last_name, v_english_name, v_nickname, v_phone, v_verified
    from public.profiles where id = v_uid;
  if v_verified is null or coalesce(btrim(v_phone), '') = '' then
    return 'phone_unverified';
  end if;
  -- 성·이름·영어 이름 필수 — 하나라도 비면 마이페이지로 보낸다.
  if coalesce(btrim(v_last_name), '') = '' or coalesce(btrim(v_first_name), '') = '' or coalesce(btrim(v_english_name), '') = '' then
    return 'profile_incomplete';
  end if;
  -- 표시 이름 — 닉네임 우선, 없으면 성+이름(공백 없이). 앱 전역 관례.
  v_name := coalesce(nullif(btrim(v_nickname), ''), btrim(coalesce(v_last_name, '') || coalesce(v_first_name, '')));

  select min(session_date), max(session_date), count(*)
    into v_first, v_last, v_sessions
    from public.prep_sessions where course_id = p_course_id;

  -- 첫 회차가 지난 강좌는 받지 않는다(KST 기준 — 클라 호출이라 날짜 판정도 자급).
  if v_first is null or v_first <= (now() at time zone 'Asia/Seoul')::date then
    return 'started';
  end if;

  -- 유효 신청(입금대기 + 수강확정)만 정원을 먹는다.
  select count(*) into v_count
    from public.prep_enrollments where course_id = p_course_id and status <> '취소';
  if v_count >= v_course.capacity then
    return 'full';
  end if;

  insert into public.prep_enrollments (
    course_id, user_id, student_name, student_phone,
    course_title, start_min, duration_min, session_count, first_session_date, last_session_date, price_krw
  ) values (
    p_course_id, v_uid, v_name, btrim(v_phone),
    v_course.title, v_course.start_min, v_course.duration_min, coalesce(v_sessions, v_course.session_count), v_first, v_last, v_course.price_krw
  );

  return 'ok';
end;
$$;

revoke all on function public.join_prep_course(uuid) from public;
grant execute on function public.join_prep_course(uuid) to authenticated;
