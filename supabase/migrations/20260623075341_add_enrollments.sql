-- 수강신청(enrollments) 저장 — 강사 매칭형 수강신청
-- - 학생(로그인 + 휴대폰 인증)이 /courses/<slug>/enroll에서 원하는 주간 슬롯(30분 단위)+시작일+강사를 선택해 신청.
-- - 매칭 강사(teacher_availability에 선택 슬롯이 전부 비어 있는 강사)에게 이메일 알림.
-- - 강사가 /teacher 대시보드에서 승인/거절 → 결과를 학생에게 SMS 발송.
-- - 상태/거절사유는 강사 액션(service_role)만 변경(사용자 UPDATE 정책 없음).

-- 1) 수강신청 상태 ENUM (teacher_applications 컨벤션과 동일)
create type public.enrollment_status as enum ('신청', '승인', '거절', '취소');

-- 2) enrollments 테이블 (익명 불가 — 로그인 + 휴대폰 인증 필수)
create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  course text not null,                  -- 과정 slug
  course_title text not null,            -- 과정 표시명
  start_date date not null,              -- 희망 수업 시작일
  slots jsonb not null,                  -- [{day:0-6, min:0-1439}] 주간 30분 슬롯 스냅샷(매칭 기준)
  teacher_name text,                     -- 학생 마이페이지 표시용 강사명 스냅샷(RLS로 강사 프로필 직접 조회 불가)
  student_name text,                     -- SMS/표시용 스냅샷
  student_phone text,                    -- SMS 발송용 스냅샷(신청 시점 profiles에서 복사)
  status public.enrollment_status not null default '신청',
  teacher_note text,                     -- 거절 사유 등 강사 메모
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index enrollments_student_idx on public.enrollments (student_id);
create index enrollments_teacher_status_idx on public.enrollments (teacher_id, status);
create index enrollments_created_idx on public.enrollments (created_at desc);

-- 3) RLS
alter table public.enrollments enable row level security;

-- 신청 제출: 로그인 사용자만, student_id는 본인(uid)만 허용(위조 차단).
create policy "enrollments_insert" on public.enrollments
  for insert to authenticated
  with check (student_id = auth.uid());

-- 본인 신청 조회 (학생 마이페이지)
create policy "enrollments_select_own_student" on public.enrollments
  for select to authenticated
  using (auth.uid() = student_id);

-- 본인에게 온 신청 조회 (강사 대시보드)
create policy "enrollments_select_own_teacher" on public.enrollments
  for select to authenticated
  using (auth.uid() = teacher_id);
-- UPDATE/DELETE 사용자 정책 없음 — 승인/거절/취소는 강사·관리자 액션(service_role)만.

-- 4) updated_at 자동 갱신 (기존 tg_set_updated_at 재사용)
create trigger enrollments_set_updated_at
  before update on public.enrollments
  for each row execute function public.tg_set_updated_at();
