alter table public.profiles add column if not exists plan_tier text not null default 'free';
alter table public.profiles drop constraint if exists profiles_plan_tier_check;
alter table public.profiles add constraint profiles_plan_tier_check check(plan_tier in ('free','plus','pro'));
update public.profiles set plan_tier='pro' where coalesce(is_premium,false)=true and plan_tier='free';
create or replace function public.check_and_consume_usage_tiered(p_feature text,p_free_limit integer,p_plus_limit integer,p_pro_limit integer)
returns table(allowed boolean,current_count integer,effective_limit integer,plan_tier text)
language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_tier text; v_limit integer; v_count integer; v_bonus integer;
begin
 if v_user is null then raise exception 'not authenticated'; end if;
 if p_feature not in ('chat','photo','text_nutrition','weekly_review','nutrition_advice','plan') then raise exception 'invalid feature'; end if;
 if least(p_free_limit,p_plus_limit,p_pro_limit)<0 or p_free_limit>p_plus_limit or p_plus_limit>p_pro_limit then raise exception 'invalid limits'; end if;
 select case when p.plan_tier in ('free','plus','pro') then p.plan_tier when coalesce(p.is_premium,false) then 'pro' else 'free' end into v_tier from public.profiles p where p.id=v_user;
 v_tier:=coalesce(v_tier,'free'); v_limit:=case v_tier when 'pro' then p_pro_limit when 'plus' then p_plus_limit else p_free_limit end;
 insert into public.usage_counters(user_id,feature,usage_date,count) values(v_user,p_feature,current_date,0) on conflict(user_id,feature,usage_date) do nothing;
 select count,bonus_count into v_count,v_bonus from public.usage_counters where user_id=v_user and feature=p_feature and usage_date=current_date for update;
 v_limit:=v_limit+coalesce(v_bonus,0); if v_count>=v_limit then return query select false,v_count,v_limit,v_tier; return; end if;
 update public.usage_counters set count=count+1,updated_at=now() where user_id=v_user and feature=p_feature and usage_date=current_date;
 return query select true,v_count+1,v_limit,v_tier;
end $$;
revoke all on function public.check_and_consume_usage_tiered(text,integer,integer,integer) from public,anon;
grant execute on function public.check_and_consume_usage_tiered(text,integer,integer,integer) to authenticated;
create or replace function public.profiles_guard_privileged_columns() returns trigger language plpgsql security definer set search_path=public as $$
begin if coalesce(auth.role(),'')<>'service_role' then if new.is_premium is distinct from old.is_premium then new.is_premium:=old.is_premium; end if; if new.plan_tier is distinct from old.plan_tier then new.plan_tier:=old.plan_tier; end if; if new.account_status is distinct from old.account_status and new.account_status='deletion_pending' then new.account_status:=old.account_status; end if; end if; return new; end $$;
drop trigger if exists profiles_guard_privileged_columns on public.profiles;
create trigger profiles_guard_privileged_columns before update on public.profiles for each row execute function public.profiles_guard_privileged_columns();
