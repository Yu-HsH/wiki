-- Admin-managed release notes. Nobody becomes admin automatically.
begin;
create table private.site_news_admins (
  slot smallint primary key default 1 check(slot=1),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  assigned_at timestamptz not null default now()
);
alter table private.site_news_admins enable row level security;
revoke all on private.site_news_admins from public, anon, authenticated;
grant select,insert,update,delete on private.site_news_admins to service_role;

create or replace function public.is_site_news_admin()
returns boolean language sql stable security definer set search_path = ''
as $fn$
  select auth.uid() is not null
   and exists(select 1 from private.site_news_admins a where a.user_id=auth.uid());
$fn$;
revoke all on function public.is_site_news_admin() from public, anon, authenticated;
grant execute on function public.is_site_news_admin() to authenticated, service_role;

create table public.site_news_posts (
  id uuid primary key default gen_random_uuid(),
  type text not null default '업데이트' check(type in ('업데이트','공지','점검')),
  title text not null check(char_length(btrim(title)) between 1 and 120),
  summary text not null check(char_length(btrim(summary)) between 1 and 360),
  details text[] not null default '{}'::text[] check(
    cardinality(details) between 1 and 24 and char_length(array_to_string(details,''))<=14000
  ),
  status text not null default 'draft' check(status in ('draft','published')),
  published_at timestamptz,
  author_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_news_published_requires_date check(status='draft' or published_at is not null)
);
create index site_news_published_order_idx on public.site_news_posts(published_at desc,id) where status='published';
create index site_news_admin_order_idx on public.site_news_posts(updated_at desc,id);
alter table public.site_news_posts enable row level security;
revoke all on public.site_news_posts from public,anon,authenticated;
grant select(id,type,title,summary,details,status,published_at,created_at,updated_at)
  on public.site_news_posts to anon,authenticated;
grant insert,update on public.site_news_posts to authenticated;
grant all on public.site_news_posts to service_role;
create policy "Read published site news" on public.site_news_posts
 for select to anon,authenticated using(status='published');
create policy "Operator read site news" on public.site_news_posts
 for select to authenticated using((select public.is_site_news_admin()));
create policy "Operator create site news" on public.site_news_posts
 for insert to authenticated with check((select public.is_site_news_admin()));
create policy "Operator edit site news" on public.site_news_posts
 for update to authenticated using((select public.is_site_news_admin()))
 with check((select public.is_site_news_admin()));
create or replace function private.touch_site_news_post() returns trigger
 language plpgsql set search_path='' as $fn$
begin new.updated_at:=now(); return new; end;
$fn$;
revoke all on function private.touch_site_news_post() from public,anon,authenticated;
create trigger site_news_touch_update before update on public.site_news_posts
 for each row execute function private.touch_site_news_post();
-- Preserve public history and publish this approved 2.0.2 announcement at release.
insert into public.site_news_posts(id,title,summary,details,type,status,published_at,created_at)
values ('2e100002-0202-4000-8000-000000000002'::uuid,'Wiki Race 2.0.2 — 탐험 환경 개선','오늘의 도전 단어 22개 추가와 온라인 재경기, 공개방·문서 탐험 편의성을 개선했습니다.',array['오늘의 도전 단어 후보가 기존 17개에서 39개로 늘어났습니다. 생활·과학·역사·문화·IT 등 다양한 분야의 22개를 추가하고 최근 목표 반복도 줄였습니다.','활동이 끝난 공개 대기방이 목록에 오래 남는 현상을 개선했습니다.','1:1·그룹 경기 종료 후 방장이 같은 멤버로 새 비공개 재경기 준비방을 만들 수 있습니다. 참가자는 선택하여 입장합니다.','모바일과 작은 화면의 문서 목차 위치를 개선하고, 목차와 ''맨 위로'' 버튼이 겹치는 문제를 해결했습니다.','문서 이동과 게임 화면 전환 과정에서 발생하던 일부 불편한 동작을 개선했습니다.','기존 오늘의 도전 기록·XP·랭킹 데이터는 유지됩니다. 불편한 점이나 아이디어가 있으면 언제든 알려주세요.']::text[],'업데이트','published','2026-11-10'::date::timestamptz,'2026-11-10'::date::timestamptz),
('2e100002-0202-4000-8000-000000000005'::uuid,'새로운 정글 시작 화면과 탐험대 소식','숲길이 열리는 HOME, 움직이는 랜딩과 업데이트 안내를 새롭게 선보입니다.',array['HOME 배너에 마우스를 올리면 숲길이 열리고, 배너를 누르면 모드 선택으로 이동합니다. 모바일에서도 한 번의 터치로 시작할 수 있습니다.','랜딩의 탐험 랜턴과 정글 환경 효과를 보강하고, 글씨와 인증 버튼을 선명하게 정리했습니다.','상단 ''소식'' 메뉴에서 업데이트 및 개선 사항을 확인할 수 있습니다.','이번 업데이트는 화면 및 안내 기능 개선이며 게임 규칙, XP 및 경기 기록은 변경되지 않습니다.']::text[],'업데이트','published','2026-11-05'::date::timestamptz,'2026-11-05'::date::timestamptz),
('2e100002-0202-4000-8000-000000000009'::uuid,'오늘의 탐험이 추가됐어요','모두가 같은 시작과 목표 문서로 도전하는 일일 탐험을 만나보세요.',array['오늘의 탐험 코스는 하루 단위로 바뀝니다.','같은 코스를 완주한 탐험가들의 기록을 비교할 수 있습니다.']::text[],'업데이트','published','2026-10-09'::date::timestamptz,'2026-10-09'::date::timestamptz),
('2e100002-0202-4000-8000-000000000006'::uuid,'Wiki Race 2.0 업데이트','혼자 탐험하고, 친구와 경쟁하고, 경험치를 쌓는 Wiki Race 2.0이 출시됐습니다.',array['싱글·1:1·그룹 탐험과 랭킹 및 업적 시스템을 만나보세요.','피드백을 바탕으로 화면과 게임 플레이를 계속 개선하겠습니다.']::text[],'업데이트','published','2026-10-06'::date::timestamptz,'2026-10-06'::date::timestamptz)
on conflict (id) do nothing;
commit;
