-- 프렙(가칭) — 프렌더 Plus가 개설하는 유료 강좌. 무료 연습방(friender_rooms)이 단발성 1회인 것과 달리
-- 월 단위 정규 과정이다: 월 20회 고정, 기본 수업일은 매주 월~금, 필요하면 개별 일자를 조정한다.
--
-- 이번 단계는 개설(생성)까지 — 수강신청·결제·공개 목록·회차 입장은 다음 단계에서 붙인다.
-- ⚠️ zoom_url은 여기에도 저장하지 않는다(friender_rooms와 같은 정책: 입장 시점에 개설자 profiles에서 최신값).
create table if not exists public.prep_courses (
  id uuid primary key default gen_random_uuid(),
  friender_id uuid not null references auth.users(id) on delete cascade,
  -- 표시 스냅샷: RLS(profiles_select_own)로 타인 profiles를 읽을 수 없어 목록에서 필요(friender_rooms와 동일).
  friender_name text,
  friender_nickname text,
  title text not null,
  description text,
  level text not null,                          -- src/data/room-levels.ts 코드 재사용(앱에서 검증)
  capacity smallint not null check (capacity between 1 and 100),
  -- 시각은 강좌 단위로 고정한다 — 조정 대상은 '일자'이지 시각이 아니다(요구사항).
  start_min smallint not null check (start_min between 0 and 1439 and start_min % 10 = 0),
  duration_min smallint not null check (duration_min between 20 and 120 and duration_min % 10 = 0),
  session_count smallint not null default 20 check (session_count > 0),
  -- 수강료는 관리자가 정한 고정가(프렌더 입력 불가). 상수가 바뀌어도 기존 강좌는 개설 시점 값을 유지해야 하므로 스냅샷.
  price_krw integer not null check (price_krw >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 회차 — JSON 배열이 아니라 행으로 둔다: 앞으로 회차별 입장·출결·연기가 붙을 자리이고(classes와 같은 이유),
-- 일자 조정도 행 갱신이 자연스럽다.
create table if not exists public.prep_sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.prep_courses(id) on delete cascade,
  session_no smallint not null check (session_no > 0), -- 1..session_count
  session_date date not null,                          -- KST 날짜(YYYY-MM-DD)
  created_at timestamptz not null default now(),
  unique (course_id, session_no),
  unique (course_id, session_date)                     -- 같은 강좌가 하루에 두 회차를 갖지 않는다
);

create index if not exists prep_courses_owner_idx on public.prep_courses (friender_id, created_at desc);
create index if not exists prep_sessions_course_idx on public.prep_sessions (course_id, session_date);

alter table public.prep_courses enable row level security;
alter table public.prep_sessions enable row level security;

-- 개설자 본인만 조회. 공개(수강신청) 정책은 그 동선을 붙일 때 추가한다.
create policy "prep_courses_select_own" on public.prep_courses
  for select to authenticated
  using (auth.uid() = friender_id);

create policy "prep_sessions_select_own" on public.prep_sessions
  for select to authenticated
  using (exists (select 1 from public.prep_courses c where c.id = course_id and c.friender_id = auth.uid()));

-- 사용자 INSERT/UPDATE/DELETE 정책 없음 — 쓰기는 프렙 액션이 requireFrienderPlus() 가드 후
-- service_role로 수행하고 .eq("friender_id", userId)로 소유권을 쿼리에서 강제한다(friender_rooms와 동일 컨벤션).

create trigger prep_courses_set_updated_at before update on public.prep_courses
  for each row execute function public.tg_set_updated_at();
