-- 연습방 제한 인원 하한 2명 → 1명.
-- capacity는 '개설자를 제외한 참가자 정원'이라 1이면 프렌더 1 : 회원 1 대화가 된다(1:1 연습 수요).
-- 기존 행은 전부 2 이상이라 새 범위를 이미 만족한다 — 데이터 재작성 불필요.

-- 20260820005055의 인라인 check는 자동 명명(friender_rooms_capacity_check).
alter table public.friender_rooms drop constraint if exists friender_rooms_capacity_check;

alter table public.friender_rooms
  add constraint friender_rooms_capacity_check
  check (capacity between 1 and 100);
