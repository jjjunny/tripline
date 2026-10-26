-- Tripline 데이터베이스 스키마
-- Supabase 대시보드 > SQL Editor 에 이 파일 전체를 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전하도록 if not exists / drop policy if exists 를 사용합니다.

-- 1) 여행
create table if not exists public.trips (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null,
  destination text,
  region      text not null default 'overseas'
              check (region in ('domestic', 'overseas')),  -- 국내: 카카오맵, 해외: 구글 지도
  start_date  date,
  color       text not null default '#2F6FDB',
  position    double precision not null default 0,
  created_at  timestamptz not null default now()
);

-- 예전 스키마를 이미 실행했다면 region 컬럼만 추가
alter table public.trips
  add column if not exists region text not null default 'overseas'
  check (region in ('domestic', 'overseas'));

-- 2) 여행의 날짜(1일차, 2일차 ...)
create table if not exists public.trip_days (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position    integer not null default 0,
  title       text,
  travel_mode text not null default 'TRANSIT'
              check (travel_mode in ('DRIVING', 'WALKING', 'TRANSIT', 'BICYCLING')),
  created_at  timestamptz not null default now()
);

-- 3) 방문할 장소. day_id 가 null 이면 '보관함'(아직 날짜를 정하지 않은 장소)
create table if not exists public.stops (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  day_id      uuid references public.trip_days (id) on delete set null,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position    double precision not null default 0,
  place_id    text,
  name        text not null,
  address     text,
  lat         double precision,
  lng         double precision,
  visited     boolean not null default false,
  visit_time  text,
  memo        text,
  created_at  timestamptz not null default now()
);

-- 4) 준비물 체크리스트
create table if not exists public.checklist_items (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text        text not null,
  done        boolean not null default false,
  position    double precision not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists trips_user_idx            on public.trips (user_id);
create index if not exists trip_days_trip_idx        on public.trip_days (trip_id);
create index if not exists stops_trip_idx            on public.stops (trip_id);
create index if not exists stops_day_idx             on public.stops (day_id);
create index if not exists checklist_items_trip_idx  on public.checklist_items (trip_id);

-- 행 단위 보안(RLS): 로그인한 사용자는 자기 데이터만 읽고 쓸 수 있습니다.
alter table public.trips           enable row level security;
alter table public.trip_days       enable row level security;
alter table public.stops           enable row level security;
alter table public.checklist_items enable row level security;

drop policy if exists "own trips" on public.trips;
create policy "own trips" on public.trips
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "own trip_days" on public.trip_days;
create policy "own trip_days" on public.trip_days
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "own stops" on public.stops;
create policy "own stops" on public.stops
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "own checklist_items" on public.checklist_items;
create policy "own checklist_items" on public.checklist_items
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
