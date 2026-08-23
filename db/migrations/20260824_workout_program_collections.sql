-- Canonical copy: supabase/migrations/20260824010000_workout_program_collections.sql
create table if not exists public.workout_program_collections (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80), source text not null check (source in ('regional', 'custom', 'assessment')),
  focus_area text not null default '', exercises jsonb not null default '[]'::jsonb check (jsonb_typeof(exercises) = 'array'),
  is_active boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists workout_program_collections_user_updated_idx on public.workout_program_collections(user_id, updated_at desc);
alter table public.workout_program_collections enable row level security;
create policy "Users can read own program collections" on public.workout_program_collections for select using (auth.uid() = user_id);
create policy "Users can insert own program collections" on public.workout_program_collections for insert with check (auth.uid() = user_id);
create policy "Users can update own program collections" on public.workout_program_collections for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own program collections" on public.workout_program_collections for delete using (auth.uid() = user_id);
insert into public.workout_program_collections (user_id, name, source, focus_area, exercises, is_active)
select user_id, 'Test Sonucu Programım', 'assessment', coalesce(workouts->0->>'area', ''), workouts, true from public.workout_plans
where jsonb_typeof(workouts) = 'array' and jsonb_array_length(workouts) > 0 and not exists (select 1 from public.workout_program_collections c where c.user_id = workout_plans.user_id);
