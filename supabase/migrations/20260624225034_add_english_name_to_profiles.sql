-- 학생(및 공용) 영문 이름. 수강신청 시 필수, 마이페이지 회원정보에서 입력.
-- 민감 컬럼 아님 → 별도 트리거/RLS 불필요(profiles_update_own으로 본인 갱신).
alter table public.profiles add column if not exists english_name text;
