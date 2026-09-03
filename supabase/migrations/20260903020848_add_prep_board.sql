-- 샤우팅 강좌 게시판 — 글(공지/일반) + 댓글. 강좌 상세 모달 「게시판」 탭이 쓴다.
-- 읽기: '승인' 강좌면 누구나(비로그인 포함). 쓰기: 서버 액션(service_role) 전담 — 정책을 두지 않는 이유는 아래.
create type public.prep_board_post_kind as enum ('공지', '일반');

create table if not exists public.prep_board_posts (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.prep_courses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- 표시 스냅샷 — profiles_select_own RLS라 타인 profiles를 못 읽는다(friender_room_reviews.user_name과 같은 이유).
  author_name text not null,
  -- 작성 시점의 개설 프렌더 여부(배지 표시용 스냅샷). 권한 판정은 매 요청 서버가 다시 계산하므로
  -- 이 값은 authoritative가 아니다.
  is_host boolean not null default false,
  kind public.prep_board_post_kind not null default '일반',
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 목록 조회는 항상 강좌 + 종류 + 최신순이다(공지 전량 / 일반 글 커서 페이징).
create index if not exists prep_board_posts_course_idx on public.prep_board_posts (course_id, kind, created_at desc);

create table if not exists public.prep_board_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.prep_board_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  is_host boolean not null default false,
  body text not null check (char_length(body) between 1 and 300),
  -- 댓글은 수정이 없다(작성·삭제만) → updated_at·트리거를 두지 않는다.
  created_at timestamptz not null default now()
);

create index if not exists prep_board_comments_post_idx on public.prep_board_comments (post_id, created_at);

alter table public.prep_board_posts enable row level security;
alter table public.prep_board_comments enable row level security;

-- 공개 읽기 — '승인' 강좌의 글만(prep_courses_select_public과 같은 기준. 심사 중·거절·초안 강좌는
-- 상세 모달 자체가 열리지 않지만 RLS로도 닫아 둔다).
create policy "prep_board_posts_select_public" on public.prep_board_posts
  for select to anon, authenticated
  using (exists (select 1 from public.prep_courses c where c.id = course_id and c.status = '승인'));

create policy "prep_board_comments_select_public" on public.prep_board_comments
  for select to anon, authenticated
  using (
    exists (
      select 1
      from public.prep_board_posts p
      join public.prep_courses c on c.id = p.course_id
      where p.id = post_id and c.status = '승인'
    )
  );

-- 사용자 INSERT/UPDATE/DELETE 정책 없음 — 작성 자격이 "개설 프렌더(prep_courses.friender_id) ∥
-- 유효 신청(prep_enrollments.status in ('입금대기','수강확정'))"이라 다른 테이블 join이 필요하고,
-- 공지는 그중 호스트만이라는 조건이 하나 더 붙는다. with check로 옮기면 길이 검증·rate limit·
-- 작성자 스냅샷 계산을 못 걸친다 → prep_enrollments·friender_room_reviews와 같은 선택
-- (서버 액션 service_role 전담).

create trigger prep_board_posts_set_updated_at before update on public.prep_board_posts
  for each row execute function public.tg_set_updated_at();
