alter table public.classes add column conducted_override boolean;

comment on column public.classes.conducted_override is
  'admin 수동 진행여부 보정: null=자동(conducted_at 기준), true=강제 진행됨, false=강제 미진행';
