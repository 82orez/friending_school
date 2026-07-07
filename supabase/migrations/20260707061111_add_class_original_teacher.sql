-- 1회성 강사 대체(adminReassignClass) 시 원 강사가 그 회차를 read-only로 계속 볼 수 있게 원 강사 id 보존.
-- adminReassignClass가 teacher_id를 대타로 덮어쓰기 전, 최초 1회 이 컬럼에 원 강사를 저장(coalesce로 최초값 유지).
-- 원 강사 read-only 조회를 위해 select 정책 추가(기존 own_teacher/own_student 정책과 OR 결합).
-- additive nullable — 쓰기는 service_role 액션만. 원 강사 계정 삭제 시 on delete set null(대타·학생 행 보존).
alter table public.classes add column if not exists original_teacher_id uuid references auth.users(id) on delete set null;

create policy "classes_select_original_teacher" on public.classes
  for select to authenticated
  using (auth.uid() = original_teacher_id);
