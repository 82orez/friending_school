-- 프렙 **수강신청 접수 시간창** — KST 07:00~19:00에만 신청을 받는다(19:00 ~ 익일 07:00 마감).
--
-- 왜: 신청이 접수되는 즉시 신청자에게 무통장 입금 안내 SMS, 관리자에게 메일, 개설 프렌더에게 SMS가 나간다.
--     심야 접수는 곧 심야 문자 발송이고, 입금 대조·응대가 불가능한 시간대에 결제 동선이 열리는 것과 같다.
--
-- ⚠️ 앱에도 같은 판정이 있다(src/data/prep.ts PREP_APPLY_OPEN_MIN/CLOSE_MIN + src/lib/prep.ts isPrepApplyOpen).
--    그럼에도 여기에 두는 이유: 이 함수는 authenticated에 grant돼 **브라우저가 직접 호출할 수 있다** —
--    서버 액션의 선검사만으로는 우회된다(이름·전화·가격을 인자로 받지 않는 것과 같은 이유).
--    상수를 SQL이 자급하는 사정은 NO_SHOW_GRACE_MIN(join_friender_room)과 같다. 바꿀 땐 두 곳을 함께.
--
-- ⚠️ 시그니처는 그대로 유지한다 — 인자를 바꾸면 오버로드가 생겨 옛 버전이 authenticated에 grant된 채 남는다.
-- 본문은 20260826003601(중도 수강신청) 그대로이고 **시간창 검사 한 블록만** 더한다.
--
-- 검사 위치: `already` 뒤 · `phone_unverified`/`profile_incomplete` 앞.
--   이미 신청한 사람에게 'closed'를 돌려주면 "왜 못 하지"가 되고, 반대로 프로필을 고치고 와도
--   어차피 시간에 막히는 상황이라 프로필 안내를 먼저 띄우면 헛걸음이 된다.
create or replace function public.join_prep_course(p_course_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course public.prep_courses%rowtype;
  v_uid uuid := auth.uid();
  v_last date;
  v_sessions int;
  v_remaining int;
  v_next date;
  v_unit int;
  v_price int;
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

  -- 접수 시간창 — KST 07:00~19:00. `not between 7 and 18`은 18:59:59까지 통과하고 19:00:00부터 막는다
  -- (앱 헬퍼의 반개구간 `m >= 420 and m < 1140`과 같은 경계).
  if extract(hour from (now() at time zone 'Asia/Seoul')) not between 7 and 18 then
    return 'closed';
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

  -- 강좌 전체 — 마지막 회차(스냅샷용)와 전체 회차 수(단가 계산의 모수).
  select max(session_date), count(*)
    into v_last, v_sessions
    from public.prep_sessions where course_id = p_course_id;

  -- 남은 회차 — 종료 시각(session_date + start_min + duration_min 분)이 KST 현재보다 미래인 것.
  -- 회차별 시각 컬럼이 없어 강좌 단위 시각을 날짜에 합성한다(앱 kstDateMinToMs와 같은 모델).
  select count(*), min(session_date)
    into v_remaining, v_next
    from public.prep_sessions
    where course_id = p_course_id
      and session_date + make_interval(mins => v_course.start_min + v_course.duration_min) > (now() at time zone 'Asia/Seoul');

  -- 남은 회차가 없으면 끝난 강좌다(회차가 아예 없는 강좌도 여기로 걸린다).
  if coalesce(v_remaining, 0) = 0 then
    return 'ended';
  end if;

  -- 유효 신청(입금대기 + 수강확정)만 정원을 먹는다.
  select count(*) into v_count
    from public.prep_enrollments where course_id = p_course_id and status <> '취소';
  if v_count >= v_course.capacity then
    return 'full';
  end if;

  -- 잔여 비례 청구액. v_sessions는 위에서 count(*)라 0이면 이미 'ended'로 빠졌다.
  -- ⚠️ 단가는 **절사(floor)** — 반올림하면 나누어떨어지지 않는 가격에서 1회분이 정가 비율보다 비싸진다.
  --    절사는 항상 학생에게 유리한 쪽이고, `단가 × 잔여 = 청구액`이 정확히 성립해 설명도 어긋나지 않는다.
  if v_remaining >= v_sessions then
    v_price := v_course.price_krw;
  else
    v_unit := floor(v_course.price_krw::numeric / v_sessions)::int;
    v_price := v_unit * v_remaining;
  end if;

  insert into public.prep_enrollments (
    course_id, user_id, student_name, student_phone,
    course_title, start_min, duration_min, session_count, first_session_date, last_session_date, price_krw
  ) values (
    p_course_id, v_uid, v_name, btrim(v_phone),
    v_course.title, v_course.start_min, v_course.duration_min, v_remaining, v_next, v_last, v_price
  );

  return 'ok';
end;
$$;

revoke all on function public.join_prep_course(uuid) from public;
grant execute on function public.join_prep_course(uuid) to authenticated;
