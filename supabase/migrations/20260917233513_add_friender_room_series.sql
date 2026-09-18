-- 무료 연습방을 "주간 스케줄 시리즈"로 전환한다.
-- 프렌더가 시작일 + 요일(예: 월수금) + 기간(1~8주)을 고르면 회차가 자동 생성되고,
-- 생성된 회차 하나하나가 지금까지와 똑같은 friender_rooms 행(=방)이 된다.
--
-- ⚠️ 부모 테이블을 만들지 않는다 — 예약(join_friender_room RPC)·노쇼 유예·입장·후기가 전부
--    '방 단위'로 이미 돌아가므로, 묶음 키(series_id)만 붙이면 소비 화면이 그대로 살아남는다.
--    (샤우팅은 '강좌 단위 결제'라는 축이 있어 prep_courses/prep_sessions 분리가 필요했다.)
--
-- ⚠️ 회차 번호(series_no)·총 회차(series_total) 컬럼을 두지 않는다 — 날짜 오름차순 index+1로
--    파생한다. 회차를 개별 삭제해도 번호가 자동으로 당겨져 "2/12인데 실제 11개"가 안 생긴다.
--    (샤우팅이 session_no를 저장한 건 주제가 '날짜'가 아니라 '회차 번호'에 귀속돼야 해서인데,
--     여기서는 topic이 회차 행에 직접 붙으므로 그 문제가 없다.)

alter table public.friender_rooms
  -- 같은 시리즈로 한 번에 개설된 회차들의 묶음 키.
  -- ⚠️ null = 전환 이전에 개설된 단발 방. 백필하지 않고 앱이 `series_id ?? id`로 그룹핑한다
  --    (전 행 UPDATE는 friender_rooms_set_updated_at 트리거가 updated_at을 전부 덮어쓴다 —
  --     prep 심사 컬럼 추가(20260822224242)에서 기본값 스왑으로 우회했던 것과 같은 함정).
  add column if not exists series_id uuid,
  -- 회차별 주제(선택). title은 이제 '시리즈 이름'이라 회차마다 같은 값이 들어간다.
  add column if not exists topic text;

-- 시리즈 단위 조회(프렌더 방 관리·홈 카드)가 항상 series_id + 날짜 순이라 복합 인덱스.
create index if not exists friender_rooms_series_idx on public.friender_rooms (series_id, session_date);

comment on column public.friender_rooms.series_id is '같은 시리즈로 개설된 회차 묶음 키. null이면 전환 이전 단발 방(앱이 series_id ?? id로 그룹핑).';
comment on column public.friender_rooms.topic is '회차별 주제(선택). title은 시리즈 이름.';
