-- 학생 마이페이지 회원정보: 주소(우편번호+기본주소+상세주소) 추가.
-- 선택 입력(nullable). 자가 변경 차단 트리거(prevent_role/phone) 대상 아님 →
-- 본인 세션 client + profiles_update_own RLS로 갱신 가능(service_role 불필요).
alter table public.profiles
  add column if not exists postcode text,
  add column if not exists address text,
  add column if not exists address_detail text;
