-- Kota ve reklam ödülü mutasyonları daha önce doğrudan authenticated rolüne
-- açıktı. Bir kullanıcı refund_usage_counter ile sayacını sıfırlayabiliyor,
-- grant_usage_bonus parametrelerini büyüterek günlük bonus tavanını aşabiliyordu.

revoke all on function public.refund_usage_counter(text, integer) from public, anon, authenticated;
revoke all on function public.grant_usage_bonus(text, integer, integer) from public, anon, authenticated;

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
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;
  if p_user_id is null then
    raise exception 'user required';
  end if;
  if p_feature not in ('chat', 'photo', 'text_nutrition', 'weekly_review', 'nutrition_advice', 'plan') then
    raise exception 'invalid feature';
  end if;

  update public.usage_counters uc
  set count = greatest(uc.count - 1, 0), updated_at = now()
  where uc.user_id = p_user_id
    and uc.feature = p_feature
    and uc.usage_date = current_date
  returning uc.count into v_new_count;

  return coalesce(v_new_count, 0);
end;
$$;

revoke all on function public.refund_usage_counter_for_user(uuid, text) from public, anon, authenticated;
grant execute on function public.refund_usage_counter_for_user(uuid, text) to service_role;

create or replace function public.grant_usage_bonus_for_user(
  p_user_id uuid,
  p_feature text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_bonus integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;
  if p_user_id is null then
    raise exception 'user required';
  end if;
  if p_feature not in ('chat', 'text_nutrition') then
    raise exception 'invalid feature';
  end if;

  insert into public.usage_counters (user_id, feature, usage_date, count)
  values (p_user_id, p_feature, current_date, 0)
  on conflict (user_id, feature, usage_date) do nothing;

  update public.usage_counters uc
  set bonus_count = least(uc.bonus_count + 1, 3), updated_at = now()
  where uc.user_id = p_user_id
    and uc.feature = p_feature
    and uc.usage_date = current_date
  returning uc.bonus_count into v_new_bonus;

  return v_new_bonus;
end;
$$;

revoke all on function public.grant_usage_bonus_for_user(uuid, text) from public, anon, authenticated;
grant execute on function public.grant_usage_bonus_for_user(uuid, text) to service_role;

-- Bu yardımcı fonksiyonun UUID parametresi başka kullanıcıların XP bandını
-- sorgulamak için kullanılabiliyordu. Dış erişimi kaldır; kota fonksiyonu
-- sahibi SECURITY DEFINER bağlamında çağırmaya devam edebilir.
revoke all on function public.hedefit_xp_chat_bonus(uuid) from public, anon, authenticated;

-- RLS politikaları bu fonksiyonu kullanır. Normal kullanıcı yalnız kendi
-- durumunu sorgulayabilir; service_role bakım işlemlerinde başka kullanıcıyı
-- kontrol edebilir.
create or replace function public.account_is_active(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select check_user_id is not null
    and (auth.role() = 'service_role' or check_user_id = auth.uid())
    and coalesce((select account_status = 'active' from public.profiles where id = check_user_id), true);
$$;

revoke all on function public.account_is_active(uuid) from public, anon;
grant execute on function public.account_is_active(uuid) to authenticated, service_role;
