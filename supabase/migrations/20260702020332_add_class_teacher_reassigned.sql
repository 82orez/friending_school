-- classes에 강사 대체 표시용 타임스탬프 추가.
-- admin 강사 대체(단일 adminReassignClass / 일괄 adminReassignRemaining) 시 기록.
-- 학생 강의실에서 예정 수업에 "강사 변경" 배지·안내 문구 노출용(지나가면 UI에서 자동 숨김).
-- additive nullable — 트리거/RLS 변경 없음(쓰기=service_role 액션, 읽기=기존 student/teacher select).
alter table public.classes add column if not exists teacher_reassigned_at timestamptz;
