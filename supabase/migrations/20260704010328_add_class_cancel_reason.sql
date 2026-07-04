-- 개별 수업 취소 사유 — 연기(보강 O)/취소(보강 X) 및 '남은 연기' 차감 여부 구분.
--   'student' = 수강생 요구 연기(보강 O, 남은 연기 차감)
--   'company' = 강사 노쇼 등 회사 사유 연기(보강 O, 차감 없음)
--   'cancel'  = 수업 취소(보강 X, 차감 없음)
alter table public.classes add column if not exists cancel_reason text
  check (cancel_reason in ('student', 'company', 'cancel'));

-- 기존 취소 건은 학생 연기로 간주(변경 전엔 모든 취소가 '남은 연기'에 차감됐으므로 현 표시값 보존).
update public.classes set cancel_reason = 'student' where status = '취소' and cancel_reason is null;
