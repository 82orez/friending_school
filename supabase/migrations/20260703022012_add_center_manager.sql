-- 센터 담당 매니저 이름(선택 입력, nullable). admin 센터 관리에서 CRUD.
-- 트리거/RLS 변경 없음(추가 컬럼만, 쓰기는 기존 service_role 액션).
alter table public.centers add column if not exists manager_name text;
