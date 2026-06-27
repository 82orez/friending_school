-- 레거시 상담신청(applications) 제거
-- 강사 매칭형 수강신청(enrollments)으로 동선이 완전히 대체됨. admin '신청 관리' UI도 제거.
-- ⚠️ 공유 트리거 함수 tg_set_updated_at은 drop 하지 않는다(다른 테이블에서 사용 중) —
--    applications_set_updated_at 트리거는 테이블과 함께 cascade로 제거된다.

drop table if exists public.applications cascade;
drop type if exists public.application_status;
