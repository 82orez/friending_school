-- 강사 주간 가용 시간(teaching availability)
-- - 강사가 요일별로 가능한 30분 슬롯을 선택. 슬롯 1개 = row 1개.
-- - start_min = 자정 기준 분(0~1439, 30의 배수). end는 start_min+30 암묵.
-- - UI 표시 범위(06:00~24:00)는 클라가 결정 — DB는 범위 비종속(유효성만 검증).
-- - day_of_week: 0=일요일 ~ 6=토요일 (JS Date.getDay()와 동일, 변환 불필요).
--   한국어 표시 순서(월~일)는 UI에서 매핑 — 저장값은 0=일 고정.

create table public.teacher_availability (
  teacher_id  uuid not null references auth.users(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_min   smallint not null check (start_min >= 0 and start_min <= 1439 and start_min % 30 = 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (teacher_id, day_of_week, start_min)
);

create index teacher_availability_teacher_idx on public.teacher_availability (teacher_id);

alter table public.teacher_availability enable row level security;

-- 본인(강사)만 자기 슬롯 select/insert/delete. (슬롯은 boolean이라 update 불필요 — 추가/삭제로 표현.)
create policy "teacher_availability_select_own" on public.teacher_availability
  for select to authenticated using (auth.uid() = teacher_id);
create policy "teacher_availability_insert_own" on public.teacher_availability
  for insert to authenticated with check (auth.uid() = teacher_id);
create policy "teacher_availability_delete_own" on public.teacher_availability
  for delete to authenticated using (auth.uid() = teacher_id);
-- admin 조회/쓰기 정책 없음 — admin은 createAdminClient()(service_role)로 RLS 우회(기존 패턴).

create trigger teacher_availability_set_updated_at
  before update on public.teacher_availability
  for each row execute function public.tg_set_updated_at();
