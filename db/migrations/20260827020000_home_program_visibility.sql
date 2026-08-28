-- Home-screen placement is intentionally independent from active program and deletion.
alter table public.workout_program_collections
  add column if not exists show_on_home boolean not null default false;

create index if not exists workout_program_collections_home_idx
  on public.workout_program_collections (user_id, show_on_home, updated_at desc);
