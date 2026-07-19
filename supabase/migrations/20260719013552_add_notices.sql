-- 공지 사항 — admin이 등록하고 Footer(최근 3건)·/notices 목록·상세에서 노출.
-- 본문은 일반 텍스트(줄바꿈 보존 렌더). youtube_videos의 공개읽기/service_role쓰기 패턴 미러.
create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  is_visible boolean not null default true,
  is_pinned boolean not null default false, -- 상단 고정(중요 공지)
  published_at timestamptz not null default now(), -- 표시·정렬 기준(예약 게시 겸용)
  view_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notices_public_idx on public.notices (is_visible, is_pinned desc, published_at desc);

alter table public.notices enable row level security;

-- 공개 읽기: 노출 ON + 게시일 도래분만. 쓰기 정책 없음 = admin(service_role) 전용.
create policy "notices_select_public" on public.notices
  for select to anon, authenticated
  using (is_visible = true and published_at <= now());

create trigger notices_set_updated_at before update on public.notices
  for each row execute function public.tg_set_updated_at();

-- 조회수 원자 증가 — 읽기 전용 사용자가 써야 하므로 security definer(공개 노출 건만 증가).
create or replace function public.increment_notice_view(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.notices set view_count = view_count + 1
  where id = p_id and is_visible = true and published_at <= now();
$$;

revoke all on function public.increment_notice_view(uuid) from public;
grant execute on function public.increment_notice_view(uuid) to anon, authenticated;
