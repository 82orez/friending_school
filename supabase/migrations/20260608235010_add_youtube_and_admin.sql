-- 유튜브 영상(youtube_videos) + admin 권한 부여
-- - 랜딩 "호주 현지생존기" 섹션 영상. admin 대시보드에서 CRUD.
-- - 공개 SELECT는 노출(is_visible)된 영상만. 쓰기는 admin(service_role)만.

-- 1) youtube_videos 테이블
create table public.youtube_videos (
  id uuid primary key default gen_random_uuid(),
  tag text not null default '',
  url text not null,
  title text not null,
  description text not null default '',
  is_visible boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index youtube_videos_visible_idx on public.youtube_videos (is_visible, sort_order);

alter table public.youtube_videos enable row level security;

-- 공개 조회: 노출된 영상만 (랜딩). 숨김 영상/전체는 admin이 service_role로 조회.
create policy "youtube_videos_select_visible" on public.youtube_videos
  for select to anon, authenticated
  using (is_visible = true);
-- INSERT/UPDATE/DELETE 사용자 정책 없음 — admin(service_role)만.

create trigger youtube_videos_set_updated_at
  before update on public.youtube_videos
  for each row execute function public.tg_set_updated_at();

-- 2) 시드 영상 3건
insert into public.youtube_videos (tag, url, title, description, sort_order) values
  ('일자리', 'https://youtube.com/shorts/wlXR6N883J8?feature=share', '카페 면접 — 영어로 어떻게 해요?', '준이 직접 카페 매니저한테 영어로 말 건 현장.', 1),
  ('숙소', 'https://youtube.com/shorts/MXmxtoM3s3o?feature=share', '쉐어하우스 구할 때 이 말은 꼭 해야 해요', '집주인이랑 직접 대화하는 법 — 리얼 현장.', 2),
  ('현지 생활', 'https://youtube.com/shorts/B7ZNjgmynl8?feature=share', '워홀 한 달, 실제로 얼마나 벌었나요?', '수입, 지출, 생활비 리얼 공개.', 3);

-- 3) admin 권한 부여 (82orez@gmail.com)
-- role은 app_metadata + profiles 양쪽에 기록 (CLAUDE.md 정책). 계정 미존재 시 no-op.
do $$
declare v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower('82orez@gmail.com') limit 1;
  if v_id is not null then
    update public.profiles set role = 'admin', updated_at = now() where id = v_id;
    update auth.users
      set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'admin')
      where id = v_id;
  end if;
end $$;
