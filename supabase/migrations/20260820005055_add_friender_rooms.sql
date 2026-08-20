-- 프렌더 연습방(Zoom) — 프렌더가 /friender/rooms에서 개설·관리한다.
-- 방은 현재 전부 무료(가격 컬럼 없음). 유료방(프렌더 Plus 전용)은 결제 동선과 함께 별도 작업.
--
-- ⚠️ zoom_url은 이 테이블에 저장하지 않는다 — 입장 시점에 개설자 profiles에서 최신값을 읽는다
--    (classes 테이블과 동일 정책: 입장 전 URL 노출 방지 + 프로필 수정이 즉시 반영).
create table if not exists public.friender_rooms (
  id uuid primary key default gen_random_uuid(),
  friender_id uuid not null references auth.users(id) on delete cascade,
  -- 표시 스냅샷: RLS(profiles_select_own)로 타인 profiles를 읽을 수 없어 공개 목록에서 필요.
  -- classes의 teacher_name/student_name과 동일한 이유·동일한 트레이드오프(개설자 개명 시 stale).
  friender_name text,
  friender_nickname text,
  title text not null,                          -- 오늘의 주제
  description text,                             -- 방 소개 (선택)
  level text not null,                          -- src/data/room-levels.ts 코드 (앱에서 검증)
  capacity smallint not null check (capacity between 2 and 100),
  session_date date not null,                   -- KST 날짜(YYYY-MM-DD)
  start_min smallint not null check (start_min between 0 and 1439 and start_min % 30 = 0),
  duration_min smallint not null default 60 check (duration_min between 30 and 240),
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists friender_rooms_owner_idx on public.friender_rooms (friender_id, session_date desc);
create index if not exists friender_rooms_public_idx on public.friender_rooms (is_visible, session_date, start_min);

alter table public.friender_rooms enable row level security;

-- 개설자 본인 조회(관리 화면) — 비공개·지난 방 포함.
create policy "friender_rooms_select_own" on public.friender_rooms
  for select to authenticated
  using (auth.uid() = friender_id);

-- 공개 읽기: 노출 ON만. 지난 방 필터는 조회 측에서 처리(날짜+분 → KST 비교를 SQL에 넣지 않음).
-- youtube_videos_select_visible과 동일한 shape.
create policy "friender_rooms_select_public" on public.friender_rooms
  for select to anon, authenticated
  using (is_visible = true);

-- 사용자 INSERT/UPDATE/DELETE 정책 없음 — 쓰기는 friender 액션이 requireFriender() 가드 후
-- service_role로 수행하고 .eq("friender_id", userId)로 소유권을 쿼리에서 강제한다(기존 컨벤션).
create trigger friender_rooms_set_updated_at before update on public.friender_rooms
  for each row execute function public.tg_set_updated_at();
