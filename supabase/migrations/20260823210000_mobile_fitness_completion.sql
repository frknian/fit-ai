-- Supabase CLI aynası: db/migrations/20260823_mobile_fitness_completion.sql
create table if not exists public.favorite_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  meal text not null check (meal in ('Kahvaltı', 'Öğle yemeği', 'Akşam yemeği', 'Atıştırmalık')),
  grams numeric(8,2) not null check (grams > 0 and grams <= 5000),
  calories integer not null check (calories between 0 and 20000),
  protein_g numeric(7,2) not null default 0,
  carbs_g numeric(7,2) not null default 0,
  fat_g numeric(7,2) not null default 0,
  fiber_g numeric(7,2) not null default 0,
  micros jsonb not null default '{}'::jsonb,
  source_food_id uuid references public.foods(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name, grams)
);
create index if not exists favorite_meals_user_idx on public.favorite_meals(user_id, updated_at desc);
alter table public.favorite_meals enable row level security;
drop policy if exists "Users manage own favorite meals" on public.favorite_meals;
create policy "Users manage own favorite meals" on public.favorite_meals for all
  using (auth.uid() = user_id and public.account_is_active())
  with check (auth.uid() = user_id and public.account_is_active());
grant select, insert, update, delete on public.favorite_meals to authenticated;

alter table public.workout_set_logs add column if not exists set_type text not null default 'normal';
alter table public.workout_set_logs drop constraint if exists workout_set_logs_set_type_check;
alter table public.workout_set_logs add constraint workout_set_logs_set_type_check
  check (set_type in ('warmup', 'normal', 'superset', 'dropset', 'failure')) not valid;
alter table public.workout_set_logs validate constraint workout_set_logs_set_type_check;

create table if not exists public.route_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_type text not null check (activity_type in ('Koşu', 'Yürüyüş', 'Bisiklet')),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_seconds integer not null check (duration_seconds >= 0),
  distance_meters numeric(12,2) not null check (distance_meters >= 0),
  route_points jsonb not null default '[]'::jsonb,
  visibility text not null default 'private' check (visibility in ('private', 'followers', 'public')),
  created_at timestamptz not null default now()
);
create index if not exists route_activities_user_idx on public.route_activities(user_id, started_at desc);
alter table public.route_activities enable row level security;
drop policy if exists "Users manage own routes" on public.route_activities;
create policy "Users manage own routes" on public.route_activities for all
  using (auth.uid() = user_id and public.account_is_active())
  with check (auth.uid() = user_id and public.account_is_active());
grant select, insert, update, delete on public.route_activities to authenticated;
