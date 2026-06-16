-- 강사 지원(teacher_applications) 저장
-- - 학생(로그인 사용자)이 /mypage에서 강사 지원서를 제출 → 관리자(/admin/teacher-requests)가 승인/거절.
-- - 승인 시 관리자 액션(service_role)이 profiles.role + app_metadata.role을 teacher로 동기.
-- - 상태(status) 및 관리자 메모(admin_note)는 admin(service_role)만 관리.

-- 1) 지원 상태 ENUM
create type public.teacher_application_status as enum ('신청', '승인', '거절');

-- 2) teacher_applications 테이블 (익명 불가 — 로그인 필수)
create table public.teacher_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text not null,
  headline text,                   -- 한 줄 소개
  intro text not null,             -- 자기소개 / 지원 동기
  experience text,                 -- 강의/관련 경력
  status public.teacher_application_status not null default '신청',
  admin_note text,                 -- 관리자 전용 메모(거절 사유 등)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index teacher_applications_user_idx on public.teacher_applications (user_id);
create index teacher_applications_status_idx on public.teacher_applications (status);
create index teacher_applications_created_idx on public.teacher_applications (created_at desc);

-- 사용자당 '신청' 상태는 1건만 (중복 대기 신청 차단; 거절/승인 후 재신청은 허용)
create unique index teacher_applications_one_pending_idx
  on public.teacher_applications (user_id)
  where status = '신청';

-- 3) RLS
alter table public.teacher_applications enable row level security;

-- 지원 제출: 로그인 사용자만, user_id는 본인(uid)만 허용(위조 차단).
create policy "teacher_applications_insert" on public.teacher_applications
  for insert to authenticated
  with check (user_id = auth.uid());

-- 본인 지원 조회 (mypage 상태 표시)
create policy "teacher_applications_select_own" on public.teacher_applications
  for select to authenticated
  using (auth.uid() = user_id);
-- UPDATE/DELETE 사용자 정책 없음 — 상태/관리자 메모/role 변경은 admin(service_role)만.

-- 4) updated_at 자동 갱신 (기존 tg_set_updated_at 재사용)
create trigger teacher_applications_set_updated_at
  before update on public.teacher_applications
  for each row execute function public.tg_set_updated_at();
