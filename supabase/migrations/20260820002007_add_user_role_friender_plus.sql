-- 프렌더 상위 등급 'friender_plus' 추가.
-- 프렌더: Zoom 무료 연습방 개설 / 프렌더 Plus: 유료방까지 개설.
--
-- ⚠️ 이 파일은 반드시 단독으로 유지할 것.
--    Postgres는 ALTER TYPE ... ADD VALUE로 추가한 값을 같은 트랜잭션에서 사용할 수 없고,
--    Supabase CLI는 파일 1개 = 트랜잭션 1개다. friender_plus를 쓰는 DDL/DML(승인 RPC 등)은
--    이후 별도 파일에 둔다. ('friender' 추가 시 20260810234123과 동일한 이유)
--
-- RLS/트리거 변경 불필요: prevent_role_self_change는 role 값에 비의존이고,
-- role을 참조하는 RLS 정책도 없다.

alter type public.user_role add value if not exists 'friender_plus';
