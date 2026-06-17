-- profiles.headline 제거. 강사 프로필에서 미사용(한 줄 소개 항목 폐지).
alter table public.profiles drop column if exists headline;
