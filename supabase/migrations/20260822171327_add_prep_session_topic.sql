-- 프렙 회차별 주제 — 각 수업일에 진행할 주제를 하나씩 갖는다(개설 시 20개를 함께 입력).
--
-- ⚠️ nullable로 둔다: 이미 개설된 강좌의 기존 행에는 값이 없어 not null을 걸 수 없다.
--    "20개 모두 필수"는 앱(createPrepCourse)이 강제한다 — 빈 값이면 개설 자체를 거부하고
--    빈 문자열은 저장하지 않는다. 개설 후 수정 기능이 붙으면 그때 not null 승격을 검토할 것.
alter table public.prep_sessions add column if not exists topic text;
