-- Hedefit gamification: server-authoritative, idempotent rewards over existing activity data.
create table if not exists public.gamification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  daily_step_goal integer not null default 7500 check (daily_step_goal between 1000 and 100000),
  daily_water_goal_ml integer not null default 2000 check (daily_water_goal_ml between 250 and 10000),
  weekly_activity_goal integer not null default 4 check (weekly_activity_goal between 1 and 7),
  timezone text not null default 'Europe/Istanbul',
  updated_at timestamptz not null default now()
);

create table if not exists public.xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('WORKOUT_COMPLETED','STEP_GOAL_COMPLETED','ROUTE_DISTANCE','WATER_GOAL_COMPLETED','WEEKLY_GOAL_COMPLETED','WEEKLY_CHALLENGE_COMPLETED')),
  source_id text not null,
  amount integer not null check (amount > 0 and amount <= 10000),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, source, source_id)
);
create index if not exists xp_events_user_week_idx on public.xp_events (user_id, occurred_at desc);

create table if not exists public.user_achievements (
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create table if not exists public.weekly_challenges (
  id uuid primary key default gen_random_uuid(),
  challenge_type text not null check (challenge_type in ('DISTANCE','WORKOUT_COUNT','STEP_COUNT')),
  title text not null,
  target numeric not null check (target > 0),
  reward_xp integer not null check (reward_xp > 0),
  starts_on date not null,
  ends_on date not null,
  active boolean not null default true,
  check (ends_on >= starts_on),
  unique (challenge_type, starts_on)
);

alter table public.gamification_preferences enable row level security;
alter table public.xp_events enable row level security;
alter table public.user_achievements enable row level security;
alter table public.weekly_challenges enable row level security;

drop policy if exists "gamification preferences own read" on public.gamification_preferences;
create policy "gamification preferences own read" on public.gamification_preferences for select using (auth.uid() = user_id);
drop policy if exists "gamification preferences own insert" on public.gamification_preferences;
create policy "gamification preferences own insert" on public.gamification_preferences for insert with check (auth.uid() = user_id);
drop policy if exists "gamification preferences own update" on public.gamification_preferences;
create policy "gamification preferences own update" on public.gamification_preferences for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "xp events own read" on public.xp_events;
create policy "xp events own read" on public.xp_events for select using (auth.uid() = user_id);
drop policy if exists "achievements own read" on public.user_achievements;
create policy "achievements own read" on public.user_achievements for select using (auth.uid() = user_id);
drop policy if exists "challenges authenticated read" on public.weekly_challenges;
create policy "challenges authenticated read" on public.weekly_challenges for select to authenticated using (active);

create or replace function public.hedefit_award_xp(p_user_id uuid, p_source text, p_source_id text, p_amount integer, p_occurred_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.xp_events(user_id, source, source_id, amount, occurred_at)
  values (p_user_id, p_source, p_source_id, p_amount, p_occurred_at)
  on conflict (user_id, source, source_id) do nothing;
end $$;
revoke all on function public.hedefit_award_xp(uuid,text,text,integer,timestamptz) from public, anon, authenticated;

create or replace function public.hedefit_activity_rewards()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  prefs public.gamification_preferences%rowtype;
  local_day date;
  week_start date;
  activity_count integer;
  week_distance numeric;
  activity_hour integer;
begin
  select * into prefs from public.gamification_preferences where user_id = new.user_id;
  if not found then
    insert into public.gamification_preferences(user_id) values (new.user_id) on conflict do nothing;
    select * into prefs from public.gamification_preferences where user_id = new.user_id;
  end if;

  if tg_table_name = 'workout_sessions' then
    local_day := (new.completed_at at time zone prefs.timezone)::date;
    week_start := date_trunc('week', local_day::timestamp)::date;
    perform public.hedefit_award_xp(new.user_id, 'WORKOUT_COMPLETED', new.id::text, 50, new.completed_at);
    select count(distinct (completed_at at time zone prefs.timezone)::date) into activity_count
      from public.workout_sessions where user_id = new.user_id
      and (completed_at at time zone prefs.timezone)::date between week_start and week_start + 6;
    if activity_count >= prefs.weekly_activity_goal then
      perform public.hedefit_award_xp(new.user_id, 'WEEKLY_GOAL_COMPLETED', week_start::text, 100, new.completed_at);
    end if;
    activity_hour := extract(hour from new.completed_at at time zone prefs.timezone);
    insert into public.user_achievements(user_id, achievement_id, unlocked_at) values (new.user_id, 'first_activity', new.completed_at) on conflict do nothing;
    if (select count(*) from public.workout_sessions where user_id = new.user_id) >= 50 then
      insert into public.user_achievements(user_id, achievement_id, unlocked_at) values (new.user_id, 'workouts_50', new.completed_at) on conflict do nothing;
    end if;
    if activity_hour < 8 and (select count(*) from public.workout_sessions where user_id = new.user_id and extract(hour from completed_at at time zone prefs.timezone) < 8) >= 10 then
      insert into public.user_achievements(user_id, achievement_id, unlocked_at) values (new.user_id, 'early_bird', new.completed_at) on conflict do nothing;
    end if;
    if activity_hour >= 20 and (select count(*) from public.workout_sessions where user_id = new.user_id and extract(hour from completed_at at time zone prefs.timezone) >= 20) >= 10 then
      insert into public.user_achievements(user_id, achievement_id, unlocked_at) values (new.user_id, 'night_athlete', new.completed_at) on conflict do nothing;
    end if;
  elsif tg_table_name = 'daily_steps' and new.steps >= prefs.daily_step_goal then
    perform public.hedefit_award_xp(new.user_id, 'STEP_GOAL_COMPLETED', new.local_date::text, 20, new.local_date::timestamp at time zone prefs.timezone);
    if (select coalesce(sum(steps), 0) from public.daily_steps where user_id = new.user_id) >= 100000 then
      insert into public.user_achievements(user_id, achievement_id) values (new.user_id, 'steps_100k') on conflict do nothing;
    end if;
  elsif tg_table_name = 'water_logs' and new.milliliters >= prefs.daily_water_goal_ml then
    perform public.hedefit_award_xp(new.user_id, 'WATER_GOAL_COMPLETED', new.local_date::text, 10, new.local_date::timestamp at time zone prefs.timezone);
  elsif tg_table_name = 'route_activities' and new.status = 'completed' then
    local_day := (new.started_at at time zone prefs.timezone)::date;
    week_start := date_trunc('week', local_day::timestamp)::date;
    insert into public.weekly_challenges(challenge_type, title, target, reward_xp, starts_on, ends_on)
    values ('DISTANCE', '15 km Koş/Yürü', 15, 250, week_start, week_start + 6)
    on conflict (challenge_type, starts_on) do nothing;
    if floor(greatest(new.distance_meters, 0) / 1000) > 0 then
      perform public.hedefit_award_xp(new.user_id, 'ROUTE_DISTANCE', new.id::text, floor(new.distance_meters / 1000)::integer * 10, new.started_at);
    end if;
    select coalesce(sum(distance_meters), 0) into week_distance from public.route_activities
      where user_id = new.user_id and status = 'completed'
      and (started_at at time zone prefs.timezone)::date between week_start and week_start + 6;
    if week_distance >= 15000 then
      perform public.hedefit_award_xp(new.user_id, 'WEEKLY_CHALLENGE_COMPLETED', 'distance:' || week_start::text, 250, new.started_at);
    end if;
    insert into public.user_achievements(user_id, achievement_id, unlocked_at) values (new.user_id, 'first_activity', new.started_at) on conflict do nothing;
    if (select coalesce(sum(distance_meters), 0) from public.route_activities where user_id = new.user_id and status = 'completed') >= 42200 then
      insert into public.user_achievements(user_id, achievement_id, unlocked_at) values (new.user_id, 'marathon_distance', new.started_at) on conflict do nothing;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists hedefit_workout_rewards on public.workout_sessions;
create trigger hedefit_workout_rewards after insert or update of completed_at on public.workout_sessions for each row execute function public.hedefit_activity_rewards();
drop trigger if exists hedefit_step_rewards on public.daily_steps;
create trigger hedefit_step_rewards after insert or update of steps on public.daily_steps for each row execute function public.hedefit_activity_rewards();
drop trigger if exists hedefit_water_rewards on public.water_logs;
create trigger hedefit_water_rewards after insert or update of milliliters on public.water_logs for each row execute function public.hedefit_activity_rewards();
drop trigger if exists hedefit_route_rewards on public.route_activities;
create trigger hedefit_route_rewards after insert or update of distance_meters, status on public.route_activities for each row execute function public.hedefit_activity_rewards();

-- Existing history is rewarded with the same idempotency keys as live triggers.
insert into public.xp_events(user_id, source, source_id, amount, occurred_at)
select user_id, 'WORKOUT_COMPLETED', id::text, 50, completed_at from public.workout_sessions
on conflict (user_id, source, source_id) do nothing;

insert into public.xp_events(user_id, source, source_id, amount, occurred_at)
select r.user_id, 'ROUTE_DISTANCE', r.id::text, floor(r.distance_meters / 1000)::integer * 10, r.started_at
from public.route_activities r where r.status = 'completed' and r.distance_meters >= 1000
on conflict (user_id, source, source_id) do nothing;

insert into public.xp_events(user_id, source, source_id, amount, occurred_at)
select s.user_id, 'STEP_GOAL_COMPLETED', s.local_date::text, 20, s.local_date::timestamp at time zone coalesce(p.timezone, 'Europe/Istanbul')
from public.daily_steps s left join public.gamification_preferences p on p.user_id = s.user_id
where s.steps >= coalesce(p.daily_step_goal, 7500)
on conflict (user_id, source, source_id) do nothing;

insert into public.xp_events(user_id, source, source_id, amount, occurred_at)
select w.user_id, 'WATER_GOAL_COMPLETED', w.local_date::text, 10, w.local_date::timestamp at time zone coalesce(p.timezone, 'Europe/Istanbul')
from public.water_logs w left join public.gamification_preferences p on p.user_id = w.user_id
where w.milliliters >= coalesce(p.daily_water_goal_ml, 2000)
on conflict (user_id, source, source_id) do nothing;

with weekly_workouts as (
  select w.user_id, date_trunc('week', w.completed_at at time zone coalesce(p.timezone, 'Europe/Istanbul'))::date week_start,
         count(distinct (w.completed_at at time zone coalesce(p.timezone, 'Europe/Istanbul'))::date) active_days,
         max(w.completed_at) occurred_at, coalesce(max(p.weekly_activity_goal), 4) goal
  from public.workout_sessions w left join public.gamification_preferences p on p.user_id = w.user_id
  group by w.user_id, date_trunc('week', w.completed_at at time zone coalesce(p.timezone, 'Europe/Istanbul'))::date
)
insert into public.xp_events(user_id, source, source_id, amount, occurred_at)
select user_id, 'WEEKLY_GOAL_COMPLETED', week_start::text, 100, occurred_at from weekly_workouts where active_days >= goal
on conflict (user_id, source, source_id) do nothing;

with weekly_distance as (
  select r.user_id, date_trunc('week', r.started_at at time zone coalesce(p.timezone, 'Europe/Istanbul'))::date week_start,
         sum(r.distance_meters) meters, max(r.started_at) occurred_at
  from public.route_activities r left join public.gamification_preferences p on p.user_id = r.user_id
  where r.status = 'completed'
  group by r.user_id, date_trunc('week', r.started_at at time zone coalesce(p.timezone, 'Europe/Istanbul'))::date
)
insert into public.xp_events(user_id, source, source_id, amount, occurred_at)
select user_id, 'WEEKLY_CHALLENGE_COMPLETED', 'distance:' || week_start::text, 250, occurred_at from weekly_distance where meters >= 15000
on conflict (user_id, source, source_id) do nothing;

insert into public.user_achievements(user_id, achievement_id, unlocked_at)
select user_id, 'first_activity', min(occurred_at) from public.xp_events where source in ('WORKOUT_COMPLETED','ROUTE_DISTANCE') group by user_id
on conflict do nothing;
insert into public.user_achievements(user_id, achievement_id)
select user_id, 'steps_100k' from public.daily_steps group by user_id having sum(steps) >= 100000 on conflict do nothing;
insert into public.user_achievements(user_id, achievement_id)
select user_id, 'workouts_50' from public.workout_sessions group by user_id having count(*) >= 50 on conflict do nothing;
insert into public.user_achievements(user_id, achievement_id)
select user_id, 'marathon_distance' from public.route_activities where status = 'completed' group by user_id having sum(distance_meters) >= 42200 on conflict do nothing;

insert into public.weekly_challenges(challenge_type, title, target, reward_xp, starts_on, ends_on)
values ('DISTANCE', '15 km Koş/Yürü', 15, 250, date_trunc('week', current_date::timestamp)::date, date_trunc('week', current_date::timestamp)::date + 6)
on conflict (challenge_type, starts_on) do nothing;
