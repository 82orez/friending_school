-- 전자책(교재) 읽기 진행률 저장
-- - 사용자가 어느 unit까지, 어느 스크롤 위치까지 읽었는지 추적
-- - course 컬럼으로 향후 다른 시리즈 확장 가능 (현재는 'cooking'만)
-- - PK = (user_id, course, unit) — 사용자별 unit별 한 row

create table public.reading_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  course text not null,
  unit int not null check (unit between 1 and 100),
  scroll_percent int not null default 0 check (scroll_percent between 0 and 100),
  completed boolean not null default false,
  last_viewed_at timestamptz not null default now(),
  primary key (user_id, course, unit)
);

create index reading_progress_user_course_idx
  on public.reading_progress (user_id, course);

alter table public.reading_progress enable row level security;

create policy "reading_progress_select_own" on public.reading_progress
  for select using (auth.uid() = user_id);

create policy "reading_progress_insert_own" on public.reading_progress
  for insert with check (auth.uid() = user_id);

create policy "reading_progress_update_own" on public.reading_progress
  for update using (auth.uid() = user_id);
-- DELETE 정책 없음 — 사용자가 직접 삭제할 일 없음. 필요 시 service_role 사용.
