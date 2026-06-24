-- 강사 대시보드 표시용 학생 영문명 스냅샷.
-- 강사 세션 client는 RLS로 학생 profiles를 직접 조회 불가 → student_name/phone처럼 스냅샷 저장.
alter table public.enrollments add column if not exists student_english_name text;

-- 기존 행 백필: 학생이 이후 영문명을 등록했다면 그 값으로 채움(없으면 null 유지).
update public.enrollments e
set student_english_name = p.english_name
from public.profiles p
where p.id = e.student_id and p.english_name is not null and e.student_english_name is null;
