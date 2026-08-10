-- 프렌더 지원(friender_applications) 저장
-- - 로그인 회원이 /friender/apply 에서 프렌더 지원서를 제출 → 관리자가 승인/거절(승인 UI는 후속 단계).
-- - 승인 시 관리자 액션(service_role)이 profiles.role + app_metadata.role 을 friender 로 동기(후속 단계 RPC).
-- - 상태(status)/관리자 메모(admin_note)는 admin(service_role)만 관리.
--
-- teacher_applications(20260616013935~20260620020000)와 동일 구조를 따르되 프렌더 요구사항 반영:
--  - center_id 없음(프렌더는 센터 소속 개념 없음)
--  - bio/experience(학력·경력) 대신 intro 1개("회원들에게 자신을 소개하기")
--  - phone NOT NULL — 프렌더는 전화번호 SMS 인증이 필수(서버가 인증된 profiles.phone 을 스냅샷)
--  - zoom_url NOT NULL — 프렌더는 zoom 으로 회원과 소통

-- 1) 지원 상태 ENUM (teacher_application_status 와 값은 같지만 도메인 분리)
create type public.friender_application_status as enum ('신청', '승인', '거절');

-- 2) friender_applications 테이블 (익명 불가 — 로그인 필수)
create table public.friender_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,              -- 표시용 조합값(한국 관례: 성+이름)
  first_name text,
  last_name text,
  phone text not null,             -- 인증 완료된 번호 스냅샷(폼 값이 아니라 profiles.phone 복사)
  nationality text,                -- 한국어 국가명 (src/data/nationalities.ts)
  gender text,                     -- male | female (src/data/genders.ts)
  intro text not null,             -- 회원들에게 자신을 소개하기
  zoom_url text not null,
  avatar_url text,
  status public.friender_application_status not null default '신청',
  admin_note text,                 -- 관리자 전용 메모(거절 사유 등)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index friender_applications_user_idx on public.friender_applications (user_id);
create index friender_applications_status_idx on public.friender_applications (status);
create index friender_applications_created_idx on public.friender_applications (created_at desc);

-- 사용자당 '신청' 상태는 1건만 (중복 대기 신청 차단; 거절/승인 후 재신청은 허용)
create unique index friender_applications_one_pending_idx
  on public.friender_applications (user_id)
  where status = '신청';

-- 3) RLS
alter table public.friender_applications enable row level security;

-- 지원 제출: 로그인 사용자만, user_id는 본인(uid)만 허용(위조 차단).
create policy "friender_applications_insert" on public.friender_applications
  for insert to authenticated
  with check (user_id = auth.uid());

-- 본인 지원 조회 (지원 페이지 상태 표시)
create policy "friender_applications_select_own" on public.friender_applications
  for select to authenticated
  using (auth.uid() = user_id);
-- UPDATE/DELETE 사용자 정책 없음 — 상태/관리자 메모/role 변경은 admin(service_role)만.

-- 4) updated_at 자동 갱신 (기존 tg_set_updated_at 재사용)
create trigger friender_applications_set_updated_at
  before update on public.friender_applications
  for each row execute function public.tg_set_updated_at();
