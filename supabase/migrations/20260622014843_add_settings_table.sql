-- 앱 전역 설정 key-value 테이블. 현재 용도: php_to_krw(1 페소당 대한민국 원화 환율).
create table public.settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

alter table public.settings enable row level security;
-- 공개 읽기. 쓰기 정책 없음 → admin service_role만.
create policy "settings_select_all" on public.settings for select to anon, authenticated using (true);

create trigger settings_set_updated_at before update on public.settings
  for each row execute function public.tg_set_updated_at();

-- 기본 환율 시드(1 페소 = 25 원, admin이 수정).
insert into public.settings (key, value) values ('php_to_krw', '25');
