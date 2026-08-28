-- Canonical copy: db/migrations/20260828140000_daily_steps_health_connect_source.sql
alter table public.daily_steps drop constraint if exists daily_steps_source_check;
alter table public.daily_steps add constraint daily_steps_source_check
  check (source in ('device', 'health_connect', 'manual'));
