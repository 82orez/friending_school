-- 수업 진행 여부 기록. 진행 인정 = 강사 Enter 클릭(teacher_entered_at) AND 종료 후 피드백 저장 → conducted_at(sticky).
-- 쓰기는 service_role 액션(enterClass=teacher_entered_at, saveClassFeedback=conducted_at)이 처리 → 새 RLS 불필요.
-- 읽기는 기존 classes_select_own_student/_teacher + admin service_role.
alter table public.classes
  add column teacher_entered_at timestamptz,
  add column conducted_at timestamptz;
