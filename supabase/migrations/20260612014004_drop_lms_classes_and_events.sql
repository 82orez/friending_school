-- 화상수업 LMS(Phase 6) 객체 제거 — 구현 방식 변경으로 롤백.
-- 직전 마이그레이션 20260611230155(classes·class_sessions) / 20260611230156(academic_events)를 되돌린다.
-- ⚠️ 공유 함수 public.tg_set_updated_at()는 다른 테이블(applications 등)이 사용 → 제거하지 않음.

drop table if exists public.class_sessions cascade;
drop table if exists public.classes cascade;
drop table if exists public.academic_events cascade;

drop type if exists public.attendance_status;
drop type if exists public.class_status;
drop type if exists public.payment_status;
drop type if exists public.academic_event_type;
