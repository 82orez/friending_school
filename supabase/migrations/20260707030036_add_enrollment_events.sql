-- 과정 라이프사이클 이벤트 로그(감사 추적, 추가 전용·불변).
-- 수강신청 생성/승인/거절/결제완료/취소, 개별 수업 연기/취소, 강사 대체(단일/전체),
-- 남은 일정 일괄 변경, 진행여부 보정 등 구조적 이벤트를 시간순으로 기록.
-- 쓰기·읽기 모두 service_role 액션만(사용자 정책 없음) — 관리자 대시보드에서만 조회.
-- FK는 on delete set null + 스냅샷 컬럼으로 도메인 행 삭제(테스트 신청·계정 삭제) 후에도 로그 보존.
create table public.enrollment_events (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid references public.enrollments(id) on delete set null,
  class_id uuid references public.classes(id) on delete set null,
  event_type text not null,                        -- 앱 레이어 union 검증(DB enum 미사용=확장 용이)
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text,                                 -- 'student' | 'teacher' | 'admin' | 'system'
  actor_name text,                                 -- 표시용 스냅샷
  course text,                                     -- 슬러그 스냅샷(로그 자체 완결성)
  course_title text,
  student_name text,
  teacher_name text,
  detail jsonb,                                    -- 이벤트별 before/after 페이로드
  created_at timestamptz not null default now()    -- updated_at 없음(추가 전용·불변)
);

create index enrollment_events_enrollment_idx on public.enrollment_events (enrollment_id, created_at desc);
create index enrollment_events_created_idx on public.enrollment_events (created_at desc);

alter table public.enrollment_events enable row level security;
-- 사용자 INSERT/SELECT/UPDATE/DELETE 정책 없음: service_role만 읽기/쓰기.
