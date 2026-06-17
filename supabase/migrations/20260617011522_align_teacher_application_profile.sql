-- 강사 신청폼 ↔ 강사 프로필 필드 일치.
-- teacher_applications: intro→bio 리네임 + zoom_url/avatar_url 추가, profiles: experience 추가.
-- 기존 데이터 없음 — 백필 불필요. zoom_url은 DB nullable, 앱 레이어에서 필수 강제.
alter table public.teacher_applications rename column intro to bio;

alter table public.teacher_applications
  add column if not exists zoom_url text,
  add column if not exists avatar_url text;

alter table public.profiles add column if not exists experience text;
