-- payments에 결제 메모(note) 추가.
-- 무통장 입금 확정 시 실입금액이 정가보다 적은 경우(할인 등)의 사유 코멘트 저장용.
-- 트리거/RLS 변경 없음(추가 컬럼만). 쓰기=service_role(recordPayment), 읽기=기존 payments_select_own + admin service_role.
alter table public.payments add column if not exists note text;
