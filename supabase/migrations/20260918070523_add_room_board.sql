-- 프렌더 무료 연습방 게시판 — 글(공지/일반) + 댓글. 연습방 상세 모달 「게시판」 탭이 쓴다.
-- 샤우팅 게시판(20260903020848_add_prep_board.sql)의 이식본이고, 다른 점 셋은 아래에 표시했다.
-- 읽기: 그 시리즈의 방이 살아 있으면 누구나(비로그인 포함). 쓰기: 서버 액션(service_role) 전담.
create type public.room_board_post_kind as enum ('공지', '일반');

create table if not exists public.friender_room_board_posts (
  id uuid primary key default gen_random_uuid(),
  -- ⚠️ **차이 ①: FK를 걸 수 없다.** 시리즈는 부모 테이블이 아니라 **같은 series_id를 가진 friender_rooms
  --    행들의 묶음**이고(seriesKeyOf = series_id ?? id — 전환 이전 단발 방은 자기 id가 곧 키),
  --    series_id에는 unique 제약이 없어 참조 대상이 되지 못한다. 그래서 cascade 삭제가 없고, 대신
  --    ① 아래 공개 읽기 정책이 "그 키의 방이 하나라도 있을 때"만 통과시키고(방이 다 사라지면 안 보인다)
  --    ② deleteRoomSeries가 성공 후 이 테이블을 함께 지운다(best-effort).
  series_key uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- 표시 스냅샷 — profiles_select_own RLS라 타인 profiles를 못 읽는다(friender_room_reviews.user_name과 같은 이유).
  author_name text not null,
  -- 작성 시점의 개설 프렌더 여부(배지 표시용 스냅샷). 권한 판정은 매 요청 서버가 다시 계산하므로
  -- 이 값은 authoritative가 아니다.
  is_host boolean not null default false,
  kind public.room_board_post_kind not null default '일반',
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 목록 조회는 항상 시리즈 + 종류 + 최신순이다(공지 전량 / 일반 글 커서 페이징).
create index if not exists friender_room_board_posts_series_idx on public.friender_room_board_posts (series_key, kind, created_at desc);

create table if not exists public.friender_room_board_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.friender_room_board_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  is_host boolean not null default false,
  body text not null check (char_length(body) between 1 and 300),
  -- 댓글은 수정이 없다(작성·삭제만) → updated_at·트리거를 두지 않는다.
  created_at timestamptz not null default now()
);

create index if not exists friender_room_board_comments_post_idx on public.friender_room_board_comments (post_id, created_at);

alter table public.friender_room_board_posts enable row level security;
alter table public.friender_room_board_comments enable row level security;

-- 공개 읽기 — 그 시리즈의 방이 하나라도 남아 있을 때만.
-- ⚠️ **차이 ②: 샤우팅의 `status='승인'`에 대응하는 조건이 없다.** 연습방에는 개설 심사가 없고 저장 즉시
--    홈 `/`에 공개된다(friender_rooms_select_public도 using(true)). 여기서 보는 것은 "시리즈가 아직
--    존재하는가" 하나뿐이고, 그 판정 식은 loadSeriesRows의 .or() 필터와 같은 모양이다.
create policy "friender_room_board_posts_select_public" on public.friender_room_board_posts
  for select to anon, authenticated
  using (
    exists (
      select 1
      from public.friender_rooms r
      where r.series_id = series_key or (r.id = series_key and r.series_id is null)
    )
  );

create policy "friender_room_board_comments_select_public" on public.friender_room_board_comments
  for select to anon, authenticated
  using (
    exists (
      select 1
      from public.friender_room_board_posts p
      join public.friender_rooms r on (r.series_id = p.series_key or (r.id = p.series_key and r.series_id is null))
      where p.id = post_id
    )
  );

-- 사용자 INSERT/UPDATE/DELETE 정책 없음 — prep_board_*와 같은 선택이다. 작성 자격이 friender_rooms
-- join이고(개설 프렌더 판정) 공지는 그중 호스트만이라는 조건이 더 붙는데, with check로 옮기면 길이 검증·
-- rate limit·작성자 스냅샷 계산을 못 걸친다 → 서버 액션 service_role 전담.
-- ⚠️ **차이 ③: 일반 글의 쓰기 자격이 "로그인한 사용자 전부"** 다(샤우팅은 유효 신청자만). 무료·무심사
--    연습방이라 참여 장벽이 없고 **예약 전에 물어볼 창구**가 필요해서다. 자격 판정은 board-actions.ts의
--    writerRole 하나에 있고, 로그인만으로 열려 있으므로 rate limit이 유일한 방어선이다.

create trigger friender_room_board_posts_set_updated_at before update on public.friender_room_board_posts
  for each row execute function public.tg_set_updated_at();
