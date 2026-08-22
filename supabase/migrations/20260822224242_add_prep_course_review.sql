-- 프렙 강좌 개설 심사 (docs/prep.md)
--
-- 유료 강좌인데 관리자 검토 지점이 없어 수강료·커리큘럼·일정이 그대로 상품이 됐다.
-- 강사/프렌더 지원 심사(teacher_applications·friender_applications)와 같은 모양으로
-- prep_courses에 상태를 붙인다: 작성중(초안) → 신청(심사 대기) → 승인 | 거절.
-- 값이 한국어 enum인 것도 두 지원 테이블 선례(20260810234129)를 따른 것.
--
-- ⚠️ 승인/거절 전이는 서버 액션(service_role)만 한다 — prep_courses에는 쓰기 정책이 없다.
-- ⚠️ 공개(anon) select 정책은 여기서 만들지 않는다. 수강신청 동선을 붙일 때
--    prep_courses_select_public을 status = '승인' 조건과 함께 추가할 것.

create type public.prep_course_status as enum ('작성중', '신청', '승인', '거절');

-- ⚠️ 백필을 UPDATE로 하지 않는다 — prep_courses_set_updated_at 트리거가 모든 행의 updated_at을
--    마이그레이션 시각으로 덮어써 '마지막 수정' 신호가 사라진다. ADD COLUMN은 행 트리거를 타지 않으므로
--    기존 행은 기본값 '승인'으로 채우고(심사가 없던 시절에 이미 운영 중인 강좌다),
--    그 뒤 기본값만 '작성중'으로 바꿔 신규 행에 적용한다.
alter table public.prep_courses add column if not exists status public.prep_course_status not null default '승인';
alter table public.prep_courses alter column status set default '작성중';

alter table public.prep_courses
  add column if not exists admin_note text,          -- 거절 사유(관리자 입력)
  add column if not exists submitted_at timestamptz, -- 마지막 승인 요청 시각(updated_at은 단순 수정에도 바뀐다)
  add column if not exists reviewed_at timestamptz;  -- 마지막 승인/거절 처리 시각

-- admin 목록은 '신청'부터 훑고 그 안에서 최신순 — 낮은 카디널리티라 단독 (status)보다 복합이 낫다.
create index if not exists prep_courses_status_idx on public.prep_courses (status, created_at desc);

-- 초안('작성중')은 주제를 비운 채 저장할 수 있다 → 빈 문자열이 아니라 NULL로 정규화한다
-- (prep_sessions.topic은 nullable이고 "빈 문자열은 저장하지 않는다"가 기존 규칙).
-- ⚠️ 시그니처는 그대로 유지한다 — 인자를 바꾸면 오버로드가 생겨 옛 3인자 버전이 authenticated에
--    grant된 채 남는다(정규화를 우회하는 경로가 생김).
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
    values (p_course_id, i, p_dates[i], nullif(btrim(p_topics[i]), ''));
  end loop;

  return 'ok';
end;
$$;

revoke all on function public.replace_prep_sessions(uuid, date[], text[]) from public;
grant execute on function public.replace_prep_sessions(uuid, date[], text[]) to authenticated;
