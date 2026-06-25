-- 강사 승인 시 곧바로 결제 대기 상태가 되도록 '결제대기' enum 값 추가.
-- '결제대기'는 '승인'과 동일하게 강사 슬롯을 점유(중복 예약 차단). 결제 완료 처리는 추후 별도 작업.
-- ⚠️ 새 enum 값을 같은 트랜잭션에서 데이터로 사용하지 않으므로(런타임에서만 사용) 단일 마이그레이션 안전.
alter type public.enrollment_status add value if not exists '결제대기' after '승인';
