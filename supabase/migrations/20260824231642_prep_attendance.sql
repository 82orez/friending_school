-- 프렙 회차 입장(Zoom) + 출결.
-- prep_sessions를 JSON 배열이 아니라 행으로 둔 이유가 "회차별 입장·출결·연기가 붙을 자리"였고(20260822004501),
-- 이 마이그레이션이 그 자리를 채운다. 시간창·zoom URL 정책은 friender_rooms 계열을 따른다
-- (강좌 단위 start_min + duration_min → 회차는 날짜만 갖는다).

-- ── 학생 출결: 회차 × 수강생 ────────────────────────────────────────────
-- friender_room_participants.entered_at과 같은 sticky 규칙(첫 입장만 기록, 이후 입장은 덮어쓰지 않음).
-- ⚠️ classes처럼 수강생 컬럼을 회차 행에 비정규화하지 않는다 — 프렙은 수강신청이 강좌 단위라
--    회차마다 학생 행을 만들면 20 × N개가 미리 생겨야 하고 정원 변동에도 취약하다.
create table public.prep_attendance (
  session_id uuid not null references public.prep_sessions(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  entered_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

-- 내 출결 조회(마이페이지)용.
create index prep_attendance_user_idx on public.prep_attendance (user_id);

alter table public.prep_attendance enable row level security;

-- 본인 행만. 프렌더(개설자)·admin은 friender_room_participants와 같은 이유로 service_role로 읽는다
-- (참가자 신원을 공개 정책으로 열지 않는다).
create policy prep_attendance_select_own on public.prep_attendance
  for select to authenticated using (auth.uid() = user_id);

-- 쓰기 정책 없음 → 입장 기록은 서버 액션(enterPrepSession)이 service_role로 남긴다.

-- ── 회차 컬럼 2개 ───────────────────────────────────────────────────────
-- 호스트(프렌더) 첫 입장 시각 — classes.teacher_entered_at 선례. 회차당 호스트는 1명이라 컬럼으로 충분.
alter table public.prep_sessions add column host_entered_at timestamptz;

-- '오늘 수업' 안내 메일 발송 시각 — 크론이 재시도돼도 두 번 보내지 않기 위한 멱등 키.
alter table public.prep_sessions add column reminder_sent_at timestamptz;
