-- 프렙 수강신청 (docs/prep.md)
--
-- 개설·심사·홍보까지 있던 프렙에 수강생 동선을 연다.
-- 이번 범위는 **신청 접수 + 무통장 입금 안내**까지 — 카드결제·환불 자동화는 없다.
-- 관리자가 입금을 확인하면 '입금대기' → '수강확정'.
--
-- ⚠️ 용어 충돌 주의: prep_courses.status의 '신청'은 **개설 심사** 상태다.
--    수강신청 상태에는 그 단어를 쓰지 않는다('입금대기'/'수강확정'/'취소').

-- ── 1. 공개 조회 ────────────────────────────────────────────────────────
-- 승인된 강좌만 바깥(비로그인 포함)에 보인다. 초안·심사 중·거절은 계속 개설자만 본다.
create policy "prep_courses_select_public" on public.prep_courses
  for select to anon, authenticated
  using (status = '승인');

create policy "prep_sessions_select_public" on public.prep_sessions
  for select to anon, authenticated
  using (exists (select 1 from public.prep_courses c where c.id = course_id and c.status = '승인'));

-- ⚠️ permissive 정책은 **OR로 합쳐진다** — 이 정책이 생기는 순간 로그인 사용자의 조회는
--    '내 강좌'가 아니라 '내 강좌 + 승인된 모든 강좌'가 된다. 소유자 화면(/friender/prep)은
--    쿼리에서 `.eq("friender_id", …)`로 스코프를 강제하고 있어야 한다(이미 그렇게 고쳐 뒀다).
--    admin 화면은 service_role이라 애초에 RLS 밖이다.

-- ── 2. 수강신청 ────────────────────────────────────────────────────────
create type public.prep_enrollment_status as enum ('입금대기', '수강확정', '취소');

create table if not exists public.prep_enrollments (
  -- ⚠️ (course_id, user_id) 복합 PK가 아니라 id PK + 부분 unique다.
  --    돈이 걸린 신청이라 취소 이력을 남겨야 하는데(입금 확인 기록이 환불 근거),
  --    복합 PK에 '취소' 행을 남기면 같은 강좌에 재신청이 영영 막힌다(enrollments와 같은 선택).
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.prep_courses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  -- 표시·연락 스냅샷 — profiles_select_own RLS라 프렌더·관리자가 타인 profiles를 못 읽는다
  -- (연습방 참가자 user_name과 같은 이유). 전화는 **인증된 번호**를 RPC가 직접 채운다.
  student_name text,
  student_phone text,

  -- 강좌 표시 스냅샷. ⚠️ 승인이 풀리면(프렌더가 심사 대상 항목을 수정) 공개 정책에서 빠져
  --    학생 화면의 임베드 조회가 비어 버린다 → 신청 시점 값을 들고 있어야 내역이 안 깨진다.
  course_title text not null,
  start_min smallint not null,
  duration_min smallint not null,
  session_count smallint not null,
  first_session_date date,
  last_session_date date,
  -- 신청 시점 수강료. 프렌더가 나중에 가격을 바꿔도 이미 신청한 사람의 금액은 흔들리지 않는다.
  price_krw integer not null,

  status public.prep_enrollment_status not null default '입금대기',
  admin_note text,
  paid_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 같은 강좌에 유효한 신청은 1건. 취소된 행은 제외돼 재신청이 가능하다.
create unique index if not exists prep_enrollments_active_uniq
  on public.prep_enrollments (course_id, user_id) where status <> '취소';
create index if not exists prep_enrollments_user_idx on public.prep_enrollments (user_id, created_at desc);
create index if not exists prep_enrollments_course_idx on public.prep_enrollments (course_id, status);

alter table public.prep_enrollments enable row level security;

-- 본인 신청만 조회. 누가 신청했는지는 공개하지 않는다
-- (강좌별 신청자 수·명단은 서버가 service_role로 집계 — 연습방 참가자와 동일).
create policy "prep_enrollments_select_own" on public.prep_enrollments
  for select to authenticated
  using (auth.uid() = user_id);

-- 사용자 INSERT/UPDATE/DELETE 정책 없음 — 신청=아래 RPC, 취소·입금확인=서버 액션(service_role).

drop trigger if exists prep_enrollments_set_updated_at on public.prep_enrollments;
create trigger prep_enrollments_set_updated_at before update on public.prep_enrollments
  for each row execute function public.tg_set_updated_at();

-- ── 3. 신청 RPC ────────────────────────────────────────────────────────
-- 정원 검사와 insert 사이의 경쟁을 막기 위해 강좌 행을 for update로 잠가 동시 요청을 직렬화한다
-- (join_friender_room과 같은 패턴). 반환은 코드 문자열이고 액션이 한국어 메시지로 매핑한다.
--
-- ⚠️ **인자는 강좌 id 하나뿐이다.** 이 함수는 authenticated에 grant되어 브라우저가 직접 부를 수 있으므로
--    이름·전화·가격을 인자로 받으면 (a) 서버 액션의 전화 인증 게이트가 우회되고
--    (b) 임의 번호를 스냅샷에 심어 입금 확인 SMS를 남에게 보낼 수 있다.
--    → 이름·전화는 함수가 profiles에서 직접 읽고(security definer라 RLS 무관), 가격·일정은 잠근 강좌에서 읽는다.
-- ⚠️ 노쇼 유예(seatHeld) 규칙은 프렙에 적용하지 않는다 — 20회차 과정이고 자리를 잡는 건 입장이 아니라 돈이다.
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

  select first_name, last_name, nickname, phone, phone_verified_at
    into v_first_name, v_last_name, v_nickname, v_phone, v_verified
    from public.profiles where id = v_uid;
  if v_verified is null or coalesce(btrim(v_phone), '') = '' then
    return 'phone_unverified';
  end if;
  -- 표시 이름 — 닉네임 우선, 없으면 성+이름(공백 없이). 앱 전역 관례.
  v_name := coalesce(nullif(btrim(v_nickname), ''), nullif(btrim(coalesce(v_last_name, '') || coalesce(v_first_name, '')), ''));

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
