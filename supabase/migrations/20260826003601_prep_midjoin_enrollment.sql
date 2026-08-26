-- 프렙 **중도 수강신청** — 강좌가 시작된 뒤에도 남은 회차에 대해 신청을 받는다.
--
-- 왜: 첫 회차가 지나면 강좌가 목록에서 통째로 사라져(`started`) "지금 듣고 싶은 사람"을 받을 방법이 없었다.
--     20회 과정이라 후반에 들어오는 수요가 실재하고, 자리를 잡는 건 입장이 아니라 돈이라 정원 판정도 그대로 쓸 수 있다.
--
-- 바뀌는 것은 **회차 집계 블록과 insert 값뿐**이다. 앞의 검사 순서(unauthenticated → for update →
-- not_found → not_approved → own_course → already → phone_unverified → profile_incomplete)와
-- 뒤의 정원(full) 판정은 20260824015631 그대로다.
--
-- ⚠️ 시그니처는 그대로 유지한다 — 인자를 바꾸면 오버로드가 생겨 옛 버전이 authenticated에 grant된 채 남는다.
--
-- ── 정책 ──────────────────────────────────────────────────────────────────
-- 1) **남은 회차 = 종료 시각이 미래인 회차**. 날짜(session_date >= 오늘)가 아니라 회차 종료 시각으로 센다.
--    06:00~06:40 강좌에서 23시에 신청하면 오늘 회차는 이미 못 듣는데 날짜로 세면 그 회차까지 청구된다.
--    앱의 입장 시간창(canEnterClass: 시작 15분 전~**종료**)과 같은 경계라 "샀는데 못 들어가는 회차"가 안 생긴다.
-- 2) **잔여 회차 비례 요금**. 1회 단가 = round(수강료 / 전체 회차), 청구액 = 단가 × 남은 회차.
--    단 **남은 회차 = 전체 회차이면 수강료 원값 그대로**(시작 전 신청자가 반올림 오차로 정가와 어긋나면 안 된다).
--    ⚠️ 같은 공식이 앱에도 있다(src/lib/prep.ts `prepChargeKrw`) — 배너 표시액과 실제 청구액이 어긋나지 않게 함께 고칠 것.
-- 3) **스냅샷의 의미가 "강좌"에서 "내가 산 것"으로 바뀐다**:
--      first_session_date = 내 첫 수강 회차(잔여 첫 회차)   ← 회차 컷오프 키로도 쓰인다
--      session_count      = 내가 결제한 잔여 회차 수
--      price_krw          = 잔여 비례 청구액
--      last_session_date  = 강좌 마지막 회차(유지)
--    시작 전 신청자는 잔여=전체라 값이 종전과 완전히 같다 → **기존 행 백필 불필요**.
-- 4) `started` 코드는 **`ended`**(남은 회차 0)로 대체된다. 회차가 아예 없는 강좌도 여기로 걸린다.
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
