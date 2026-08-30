-- Profil oluşturma sırasında ücretli plan alanlarının taklit edilmesini,
-- AI hafıza çıkarımında sınırsız maliyet oluşmasını ve dondurulmuş hesapların
-- yeni öğün planı tablosuna erişmesini engeller.

create or replace function public.profiles_guard_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if tg_op = 'INSERT' then
      new.is_premium := false;
      new.plan_tier := 'free';
      new.account_status := 'active';
    else
      if new.is_premium is distinct from old.is_premium then
        new.is_premium := old.is_premium;
      end if;
      if new.plan_tier is distinct from old.plan_tier then
        new.plan_tier := old.plan_tier;
      end if;
      if new.account_status is distinct from old.account_status
        and new.account_status = 'deletion_pending' then
        new.account_status := old.account_status;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_privileged_columns on public.profiles;
create trigger profiles_guard_privileged_columns
before insert or update on public.profiles
for each row execute function public.profiles_guard_privileged_columns();

revoke all on function public.profiles_guard_privileged_columns() from public, anon, authenticated;

alter table public.usage_counters
  drop constraint if exists usage_counters_feature_check;
alter table public.usage_counters
  add constraint usage_counters_feature_check
  check (feature in ('chat', 'photo', 'text_nutrition', 'weekly_review', 'nutrition_advice', 'plan', 'memory'));

create or replace function public.check_and_consume_usage_tiered(
  p_feature text,
  p_free_limit integer,
  p_plus_limit integer,
  p_pro_limit integer
)
returns table (allowed boolean, current_count integer, effective_limit integer, plan_tier text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_tier text;
  v_limit integer;
  v_count integer;
  v_bonus integer;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_feature not in ('chat', 'photo', 'text_nutrition', 'weekly_review', 'nutrition_advice', 'plan', 'memory') then
    raise exception 'invalid feature';
  end if;
  if least(p_free_limit, p_plus_limit, p_pro_limit) < 0
    or p_free_limit > p_plus_limit or p_plus_limit > p_pro_limit then
    raise exception 'invalid limits';
  end if;

  select case
    when p.plan_tier in ('free', 'plus', 'pro') then p.plan_tier
    when coalesce(p.is_premium, false) then 'pro'
    else 'free'
  end into v_tier
  from public.profiles p where p.id = v_user;
  v_tier := coalesce(v_tier, 'free');

  -- Dondurulmuş veya silinmeyi bekleyen bir oturum yeni AI maliyeti üretemez.
  if not public.account_is_active(v_user) then
    return query select false, 0, 0, v_tier;
    return;
  end if;

  v_limit := case v_tier
    when 'pro' then p_pro_limit
    when 'plus' then p_plus_limit
    else p_free_limit
  end;

  insert into public.usage_counters (user_id, feature, usage_date, count)
  values (v_user, p_feature, current_date, 0)
  on conflict (user_id, feature, usage_date) do nothing;

  select uc.count, uc.bonus_count into v_count, v_bonus
  from public.usage_counters uc
  where uc.user_id = v_user and uc.feature = p_feature and uc.usage_date = current_date
  for update;

  v_limit := v_limit + coalesce(v_bonus, 0);
  if v_count >= v_limit then
    return query select false, v_count, v_limit, v_tier;
    return;
  end if;

  update public.usage_counters uc
  set count = uc.count + 1, updated_at = now()
  where uc.user_id = v_user and uc.feature = p_feature and uc.usage_date = current_date;
  return query select true, v_count + 1, v_limit, v_tier;
end;
$$;

revoke all on function public.check_and_consume_usage_tiered(text, integer, integer, integer) from public, anon;
grant execute on function public.check_and_consume_usage_tiered(text, integer, integer, integer) to authenticated;

create or replace function public.refund_usage_counter_for_user(
  p_user_id uuid,
  p_feature text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_count integer;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  if p_user_id is null then raise exception 'user required'; end if;
  if p_feature not in ('chat', 'photo', 'text_nutrition', 'weekly_review', 'nutrition_advice', 'plan', 'memory') then
    raise exception 'invalid feature';
  end if;

  update public.usage_counters uc
  set count = greatest(uc.count - 1, 0), updated_at = now()
  where uc.user_id = p_user_id and uc.feature = p_feature and uc.usage_date = current_date
  returning uc.count into v_new_count;
  return coalesce(v_new_count, 0);
end;
$$;

revoke all on function public.refund_usage_counter_for_user(uuid, text) from public, anon, authenticated;
grant execute on function public.refund_usage_counter_for_user(uuid, text) to service_role;

drop policy if exists "Users manage own meal plans" on public.meal_plan_items;
create policy "Users manage own meal plans"
on public.meal_plan_items
for all
to authenticated
using (auth.uid() = user_id and public.account_is_active())
with check (auth.uid() = user_id and public.account_is_active());
