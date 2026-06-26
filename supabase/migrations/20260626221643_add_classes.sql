-- 화상수업 클래스(classes) — 결제 확인(결제완료) 시 수강신청에서 날짜별로 자동 생성.
-- - 클래스 1개 = 수업 1회(매칭 요일 하루). 같은 날 여러 슬롯이면 한 클래스(start_min=최소, end_min=최대+30).
-- - 생성 주체 = admin 액션(confirmPayment, service_role). 사용자 INSERT/UPDATE/DELETE 정책 없음.
-- - zoom_url은 저장하지 않음 — 입장 시 강사 profiles에서 최신값 조회(변경 반영 + 입장 전 노출 방지).
-- - 학생/강사 표시명은 스냅샷(RLS로 상대 profiles 직접 조회 불가, enrollments 컨벤션과 동일).

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  course text not null,                   -- 과정 slug
  course_title text not null,             -- 과정 표시명
  teacher_name text,                      -- 표시 스냅샷
  student_name text,                      -- 표시 스냅샷
  student_english_name text,              -- 표시 스냅샷(강사 뷰)
  session_no smallint not null,           -- 1..TOTAL_SESSIONS (회차)
  session_date date not null,             -- KST 수업 날짜(YYYY-MM-DD)
  start_min smallint not null check (start_min between 0 and 1439 and start_min % 30 = 0),
  end_min smallint not null check (end_min between 30 and 1440 and end_min % 30 = 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (enrollment_id, session_no)      -- 멱등 생성용(on conflict do nothing)
);

create index classes_student_idx on public.classes (student_id, session_date);
create index classes_teacher_idx on public.classes (teacher_id, session_date);
create index classes_enrollment_idx on public.classes (enrollment_id);

alter table public.classes enable row level security;

-- 본인 수업 조회: 학생(내 강의실)·강사(내 강의실) 각각.
create policy "classes_select_own_student" on public.classes
  for select to authenticated
  using (auth.uid() = student_id);
create policy "classes_select_own_teacher" on public.classes
  for select to authenticated
  using (auth.uid() = teacher_id);
-- INSERT/UPDATE/DELETE 사용자 정책 없음 — 생성은 admin 액션(service_role)만, 정리는 FK cascade.

-- updated_at 자동 갱신 (기존 tg_set_updated_at 재사용)
create trigger classes_set_updated_at
  before update on public.classes
  for each row execute function public.tg_set_updated_at();
