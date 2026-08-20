-- 연습방 시작 시각 정책 변경: 30분 단위 → 10분 단위.
-- 진행 시간(duration_min)은 이미 10분 단위인데 시작 시각만 30분에 묶여 있어 08:10 같은 편성이 불가능했다.
-- 기존 행은 전부 30배수라 10배수 조건을 이미 만족한다 — 데이터 재작성 불필요.

-- 20260820005055의 인라인 check는 자동 명명(friender_rooms_start_min_check).
alter table public.friender_rooms drop constraint if exists friender_rooms_start_min_check;

alter table public.friender_rooms
  add constraint friender_rooms_start_min_check
  check (start_min between 0 and 1439 and start_min % 10 = 0);
