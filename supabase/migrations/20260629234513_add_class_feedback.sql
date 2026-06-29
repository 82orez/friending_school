-- 수업 종료 후 강사 피드백(텍스트 메모). 강사 작성·수정, 수강생 읽기 전용.
-- 쓰기는 service_role 액션(saveClassFeedback)이 강사 소유권+종료 가드로 처리 → 새 RLS 정책 불필요.
-- 수강생 읽기는 기존 classes_select_own_student 정책으로 자동 노출(컬럼만 추가).
alter table public.classes
  add column feedback text,
  add column feedback_at timestamptz;
