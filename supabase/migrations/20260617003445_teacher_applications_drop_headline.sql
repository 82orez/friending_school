-- teacher_applications.headline 제거. 지원 단계에선 미수집(승인 후 /teacher 에서 입력).
-- profiles.headline 은 별개 컬럼으로 유지.
alter table public.teacher_applications drop column if exists headline;
