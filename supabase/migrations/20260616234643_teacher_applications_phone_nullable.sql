-- teacher_applications.phone 을 선택 입력으로 변경 (NOT NULL → NULL 허용).
-- 기존 빈 문자열('')도 null 로 정규화.
alter table public.teacher_applications alter column phone drop not null;

update public.teacher_applications set phone = null where phone = '';
