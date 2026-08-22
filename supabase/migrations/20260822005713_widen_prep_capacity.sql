-- 프렙 제한 인원 상한 100명 → 1000명.
-- 연습방(friender_rooms, 1~100)은 소규모 대화라 그대로 두고, 프렙만 넓힌다 — 강의형이라 대형 정원이 필요하다.
-- 기존 행은 전부 100 이하라 새 범위를 이미 만족한다(데이터 재작성 불필요).
--
-- ⚠️ 같은 상한이 앱 상수(PREP_MAX_CAPACITY in src/data/prep.ts)와 서버 검증에도 있으니 함께 고칠 것.

-- 20260822004501의 인라인 check는 자동 명명(prep_courses_capacity_check).
alter table public.prep_courses drop constraint if exists prep_courses_capacity_check;

alter table public.prep_courses
  add constraint prep_courses_capacity_check
  check (capacity between 1 and 1000);
