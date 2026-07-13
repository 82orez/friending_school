-- 센터 담당 매니저 계정(FK→auth.users). 지정 시 그 사용자가 '센터 관리' 권한을 얻어
-- 소속 센터 강사 조회 + 개별 회차 강사 대체(centerReassignClass)를 수행. manager_name(텍스트)은 표시용으로 유지.
-- 트리거/RLS 변경 없음(centers는 공개 select·쓰기 service_role만). 계정 삭제 시 참조 해제.
alter table public.centers add column if not exists manager_id uuid references auth.users(id) on delete set null;
create index if not exists centers_manager_id_idx on public.centers(manager_id);
