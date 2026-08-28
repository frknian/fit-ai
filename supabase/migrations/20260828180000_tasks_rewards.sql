-- Görev sistemi: günlük hareket ödüllerini 100 XP ile sınırlar; başarımlar
-- ayrı ödüllerdir ve Fit Koç günlük kullanım hakkını toplam XP ile büyütür.
-- Bu ön koşullar, migration SQL Editor'de tek başına çalıştırıldığında da
-- güvenlidir; normal sıralı kurulumda zaten var olan tablolara dokunmaz.
create table if not exists public.gamification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  daily_step_goal integer not null default 7500,
  daily_water_goal_ml integer not null default 2000,
  weekly_activity_goal integer not null default 4,
  timezone text not null default 'Europe/Istanbul',
  updated_at timestamptz not null default now()
);
create table if not exists public.xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  source_id text not null,
  amount integer not null check (amount > 0 and amount <= 10000),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, source, source_id)
);
create table if not exists public.user_achievements (
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);
alter table public.xp_events drop constraint if exists xp_events_source_check;
alter table public.xp_events add constraint xp_events_source_check check (source in (
  'WORKOUT_COMPLETED', 'STEP_GOAL_COMPLETED', 'ROUTE_DISTANCE',
  'WATER_GOAL_COMPLETED', 'NUTRITION_TARGET_COMPLETED', 'SLEEP_GOAL_COMPLETED',
  'WEEKLY_GOAL_COMPLETED', 'WEEKLY_CHALLENGE_COMPLETED', 'ACHIEVEMENT_UNLOCKED'
));

create or replace function public.hedefit_award_xp(p_user_id uuid, p_source text, p_source_id text, p_amount integer, p_occurred_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_day date := (p_occurred_at at time zone coalesce((select timezone from public.gamification_preferences where user_id = p_user_id), 'Europe/Istanbul'))::date;
  v_today_xp integer := 0;
  v_amount integer := greatest(0, p_amount);
begin
  -- Başarım ve haftalık ödüller günlük görev tavanının dışındadır.
  if p_source not in ('ACHIEVEMENT_UNLOCKED', 'WEEKLY_GOAL_COMPLETED', 'WEEKLY_CHALLENGE_COMPLETED') then
    select coalesce(sum(amount), 0) into v_today_xp from public.xp_events
      where user_id = p_user_id and source not in ('ACHIEVEMENT_UNLOCKED', 'WEEKLY_GOAL_COMPLETED', 'WEEKLY_CHALLENGE_COMPLETED')
      and (occurred_at at time zone coalesce((select timezone from public.gamification_preferences where user_id = p_user_id), 'Europe/Istanbul'))::date = v_day;
    v_amount := least(v_amount, greatest(0, 100 - v_today_xp));
  end if;
  if v_amount > 0 then
    insert into public.xp_events(user_id, source, source_id, amount, occurred_at)
    values (p_user_id, p_source, p_source_id, v_amount, p_occurred_at)
    on conflict (user_id, source, source_id) do nothing;
  end if;
end $$;

-- Önceden kazanılmış başarımlar da bir defaya mahsus 100 XP verir.
insert into public.xp_events(user_id, source, source_id, amount, occurred_at)
select user_id, 'ACHIEVEMENT_UNLOCKED', achievement_id, 100, unlocked_at
from public.user_achievements
on conflict (user_id, source, source_id) do nothing;

create or replace function public.hedefit_xp_chat_bonus(p_user_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select least(5, case
    when coalesce(sum(amount), 0) < 300 then 0
    when coalesce(sum(amount), 0) < 500 then 1
    else 2 + floor((coalesce(sum(amount), 0) - 500) / 250.0)::integer
  end)
  from public.xp_events where user_id = p_user_id;
$$;

create or replace function public.check_and_consume_usage(p_feature text, p_free_limit integer, p_premium_limit integer)
returns table (allowed boolean, current_count integer, effective_limit integer, is_premium boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); v_is_premium boolean; v_limit integer; v_count integer; v_bonus integer; v_effective_limit integer;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_feature not in ('chat', 'photo', 'text_nutrition', 'weekly_review', 'nutrition_advice', 'plan') then raise exception 'invalid feature'; end if;
  select coalesce(p.is_premium, false) into v_is_premium from public.profiles p where p.id = v_user;
  v_is_premium := coalesce(v_is_premium, false); v_limit := case when v_is_premium then p_premium_limit else p_free_limit end;
  insert into public.usage_counters(user_id, feature, usage_date, count) values (v_user, p_feature, current_date, 0) on conflict (user_id, feature, usage_date) do nothing;
  select count, bonus_count into v_count, v_bonus from public.usage_counters where user_id = v_user and feature = p_feature and usage_date = current_date for update;
  if v_limit is null then
    update public.usage_counters set count = count + 1, updated_at = now() where user_id = v_user and feature = p_feature and usage_date = current_date;
    return query select true, v_count + 1, null::integer, v_is_premium; return;
  end if;
  v_effective_limit := v_limit + coalesce(v_bonus, 0) + case when p_feature = 'chat' then public.hedefit_xp_chat_bonus(v_user) else 0 end;
  if v_count >= v_effective_limit then return query select false, v_count, v_effective_limit, v_is_premium; return; end if;
  update public.usage_counters set count = count + 1, updated_at = now() where user_id = v_user and feature = p_feature and usage_date = current_date;
  return query select true, v_count + 1, v_effective_limit, v_is_premium;
end $$;

grant execute on function public.hedefit_xp_chat_bonus(uuid) to authenticated;
grant execute on function public.check_and_consume_usage(text, integer, integer) to authenticated;
