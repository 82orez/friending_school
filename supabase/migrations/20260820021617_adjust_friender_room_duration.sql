-- 연습방 진행 시간 정책 변경: 20분~2시간, 10분 단위(기본 40분).
-- 기존 check는 between 30 and 240이라 20분을 거부하므로 교체한다.
-- 기존 행(60분)은 새 범위·10분 배수를 모두 만족해 재작성 불필요.
alter table public.friender_rooms alter column duration_min set default 40;

-- 20260820005055의 인라인 check는 자동 명명(friender_rooms_duration_min_check).
alter table public.friender_rooms drop constraint if exists friender_rooms_duration_min_check;

alter table public.friender_rooms
  add constraint friender_rooms_duration_min_check
  check (duration_min between 20 and 120 and duration_min % 10 = 0);
