-- Canonical copy: db/migrations/20260827030000_route_activity_details.sql
alter table public.route_activities drop constraint if exists route_activities_activity_type_check;
alter table public.route_activities add constraint route_activities_activity_type_check check (activity_type in ('Koşu', 'Yürüyüş', 'Doğa Yürüyüşü', 'Trail Koşusu', 'Bisiklet'));
alter table public.route_activities add column if not exists title text not null default 'Aktivite' check (char_length(title) between 1 and 80);
alter table public.route_activities add column if not exists moving_duration_seconds integer not null default 0 check (moving_duration_seconds >= 0);
alter table public.route_activities add column if not exists average_pace_seconds_per_km integer check (average_pace_seconds_per_km is null or average_pace_seconds_per_km >= 0);
alter table public.route_activities add column if not exists average_speed_kmh numeric(7,2) not null default 0 check (average_speed_kmh >= 0);
alter table public.route_activities add column if not exists calories integer not null default 0 check (calories >= 0);
alter table public.route_activities add column if not exists status text not null default 'completed' check (status in ('active', 'paused', 'finishing', 'completed'));
