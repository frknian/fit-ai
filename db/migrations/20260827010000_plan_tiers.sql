-- Free / Plus / Pro için tek plan kaynağı. Mevcut premium hesaplar Pro'ya taşınır.
alter table public.profiles
  add column if not exists plan_tier text not null default 'free'
  check (plan_tier in ('free', 'plus', 'pro'));

update public.profiles
set plan_tier = 'pro'
where coalesce(is_premium, false) = true and plan_tier = 'free';
