-- 연습방 평점·후기 — 회원이 마이페이지에서 지난 예약에 대해 남긴다.
-- 열람은 프렌더 본인 + 관리자만(공개 목록·호스트 프로필에는 노출하지 않는 정책).
create table if not exists public.friender_room_reviews (
  id uuid primary key default gen_random_uuid(),
  -- ⚠️ cascade가 아니라 set null: 프렌더가 방을 지우면 낮은 평점이 함께 사라지는 '세탁'이 가능해진다.
  --    방이 없어져도 후기는 남아야 하므로 표시에 필요한 값은 아래 스냅샷으로 들고 있는다.
  room_id uuid references public.friender_rooms(id) on delete set null,
  friender_id uuid not null references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- 표시 스냅샷: RLS(profiles_select_own)로 타인 profiles를 읽을 수 없고, 방 삭제 후에도 목록이 의미를 유지해야 한다.
  user_name text,
  room_title text,
  session_date date,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, user_id) -- 한 방에 하나(방이 지워져 room_id가 null이 되면 제약에서 빠지지만, 그때는 재작성 경로 자체가 없다)
);

create index if not exists friender_room_reviews_friender_idx on public.friender_room_reviews (friender_id, created_at desc);
create index if not exists friender_room_reviews_user_idx on public.friender_room_reviews (user_id);

alter table public.friender_room_reviews enable row level security;

-- 작성자 본인(마이페이지에서 자기 후기 확인·수정).
create policy "friender_room_reviews_select_own" on public.friender_room_reviews
  for select to authenticated
  using (auth.uid() = user_id);

-- 프렌더 본인(받은 후기 탭).
create policy "friender_room_reviews_select_own_friender" on public.friender_room_reviews
  for select to authenticated
  using (auth.uid() = friender_id);

-- 사용자 INSERT/UPDATE/DELETE 정책 없음 — 작성 자격(방 종료 + 실제 입장)은 RLS로 표현하기 어려워
-- 서버 액션(service_role)이 전담한다. admin 조회도 service_role.

create trigger friender_room_reviews_set_updated_at before update on public.friender_room_reviews
  for each row execute function public.tg_set_updated_at();
