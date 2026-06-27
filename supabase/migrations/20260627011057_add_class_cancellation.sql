-- 화상수업 클래스 개별 취소 + 자동 보강 지원.
-- - status: 학생이 개별 수업 1회를 취소하면 '취소'로 전환(기본 '예정'). 취소 표시·입장 차단용.
-- - is_makeup: 취소 시 같은 요일/시각 다음 빈 날짜로 자동 생성되는 보강 회차 식별(라벨용).
-- 보강 회차는 session_no = 해당 enrollment 최대 session_no + 1 로 부여 → 기존 unique(enrollment_id, session_no) 충돌 없음(원래 생성 멱등성 보존).

alter table public.classes
  add column status text not null default '예정' check (status in ('예정', '취소')),
  add column is_makeup boolean not null default false;
