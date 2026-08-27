-- 프렙 결제·환불을 `payments`에 기록한다 — 정규 과정과 같은 모델.
--
-- 왜: 지금까지 프렙은 `prep_enrollments.status`만 바꿨을 뿐 **돈의 기록이 없었다**.
--     이미 입금이 확인된 신청을 관리자가 취소하면 얼마를 돌려줬는지 남는 곳이 없다.
--     곧 붙일 카드 결제도 정규처럼 payments를 소스로 쓰므로 지금 연결해 둔다
--     (무통장도 정규가 `bank-{id}` 합성 payment_id로 기록하는 것과 같은 방식 — 프렙은 `prep-bank-{id}`).
--
-- ⚠️ enrollment_id / prep_enrollment_id **XOR check는 두지 않는다** — 둘 다 `on delete set null`이라
--    원본이 지워지면 둘 다 null인 행이 정상적으로 생긴다(check를 걸면 그 삭제가 실패한다).
-- ⚠️ 매출 대시보드(loadRevenueRows)는 payments 전량을 읽는다 → 앱에서 `prep_enrollment_id is null`로
--    프렙 행을 제외한다(프렙 매출 연동은 별도 작업). 이 마이그레이션과 한 쌍이다.

alter table public.payments
  add column prep_enrollment_id uuid references public.prep_enrollments(id) on delete set null;

comment on column public.payments.prep_enrollment_id is '프렙 수강신청 결제일 때의 대상. 정규 과정 결제는 enrollment_id를 쓴다(둘 다 null 가능 — 원본 삭제 시 set null).';

create index if not exists payments_prep_enrollment_idx on public.payments(prep_enrollment_id);

-- 백필 — 이미 입금이 확인된 프렙 신청의 결제 기록.
-- 없으면 기존 확정 건을 환불할 때 결제 원본이 없어 금액 검증(잔여 = amount - cancelled_amount)을 할 수 없다.
-- 취소된 행도 paid_at이 있으면 실제로 돈이 들어왔던 건이라 함께 기록한다(그 취소가 환불이었는지는 별개 문제).
insert into public.payments (payment_id, prep_enrollment_id, student_id, amount, currency, status, method, created_at)
select 'prep-bank-' || e.id, e.id, e.user_id, coalesce(e.price_krw, 0), 'KRW', 'paid', 'bank', e.paid_at
  from public.prep_enrollments e
 where e.paid_at is not null
on conflict (payment_id) do nothing;
