-- Canonical copy: db/migrations/20260827020000_home_program_visibility.sql
alter table public.workout_program_collections
  add column if not exists show_on_home boolean not null default false;

create index if not exists workout_program_collections_home_idx
  on public.workout_program_collections (user_id, show_on_home, updated_at desc);
