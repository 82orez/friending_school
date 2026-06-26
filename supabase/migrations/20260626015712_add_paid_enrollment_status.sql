-- 결제 시스템 1단계(무통장 입금 수동 확인): admin이 입금을 확인하면 '결제완료'로 전환.
-- '결제완료'는 '승인'과 동일하게 강사 슬롯을 하드 점유(중복 예약 차단)하는 확정 상태.
-- ⚠️ 새 enum 값을 같은 트랜잭션에서 데이터로 사용하지 않으므로(런타임에서만 사용) 단일 마이그레이션 안전.
alter type public.enrollment_status add value if not exists '결제완료' after '결제대기';
