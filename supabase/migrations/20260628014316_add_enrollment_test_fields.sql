-- 관리자 테스트 수강신청 지원: 자유 수업 횟수 + 테스트 식별 플래그.
-- - total_sessions: null이면 기본 TOTAL_SESSIONS(24). 관리자 테스트 생성 시 자유 횟수 저장 → 결제확인 시 클래스 생성 개수에 반영.
-- - is_test: 관리자 "테스트 수강신청 생성"분 식별/정리용. 실 수강신청은 기본 false.
-- 둘 다 additive·nullable/defaulted라 기존 동작 무영향.

alter table public.enrollments
  add column total_sessions int,
  add column is_test boolean not null default false;
