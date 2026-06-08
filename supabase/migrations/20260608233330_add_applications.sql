-- 과정 상담 신청(applications) 저장
-- - 과정 상세페이지 신청폼 제출 내역. 비로그인(익명)·로그인 모두 제출 가능.
-- - 로그인 사용자는 user_id로 연결되어 /mypage 신청 내역에 노출.
-- - 상태(status) 및 관리자 메모(admin_note)는 admin(service_role, Phase 5)이 관리.

-- 1) 신청 상태 ENUM
create type public.application_status as enum ('신청', '확인', '완료', '취소');

-- 2) applications 테이블
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  course text not null,            -- 과정 slug (workhol/kitchen/grammar/cosmetic)
  course_title text not null,      -- 표시용 과정명
  option text,                     -- 선택한 수업 횟수/과정 라벨
  name text not null,
  phone text not null,
  email text,
  memo text,                       -- 희망 날짜/시간 등 자유 입력
  status public.application_status not null default '신청',
  admin_note text,                 -- 관리자 전용 메모
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index applications_user_idx on public.applications (user_id);
create index applications_status_idx on public.applications (status);
create index applications_created_idx on public.applications (created_at desc);

-- 3) RLS
alter table public.applications enable row level security;

-- 신청 제출: 익명/로그인 모두 가능. user_id는 본인(uid) 또는 null만 허용(위조 차단).
create policy "applications_insert" on public.applications
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

-- 본인 신청 조회 (mypage)
create policy "applications_select_own" on public.applications
  for select to authenticated
  using (auth.uid() = user_id);
-- UPDATE/DELETE 사용자 정책 없음 — 상태/관리자 메모 변경은 admin(service_role)만.

-- 4) updated_at 자동 갱신 (기존 tg_set_updated_at 재사용)
create trigger applications_set_updated_at
  before update on public.applications
  for each row execute function public.tg_set_updated_at();
