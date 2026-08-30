-- Bazı canlı kurulumlarda günlük adım tablosu eski migration geçmişinde
-- bulunmadığı hâlde sonraki Health Connect ve oyunlaştırma migration'ları bu
-- tabloyu bekliyor. Temeli idempotent biçimde kurar.
create table if not exists public.daily_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  steps integer not null check (steps >= 0),
  source text not null default 'device' check (source in ('device', 'manual')),
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_date)
);

create index if not exists daily_steps_user_date_idx
  on public.daily_steps (user_id, local_date desc);

alter table public.daily_steps enable row level security;
drop policy if exists "Users can read own step counts" on public.daily_steps;
drop policy if exists "Users can insert own step counts" on public.daily_steps;
drop policy if exists "Users can update own step counts" on public.daily_steps;
drop policy if exists "Users can delete own step counts" on public.daily_steps;
create policy "Users can read own step counts" on public.daily_steps for select using (auth.uid() = user_id);
create policy "Users can insert own step counts" on public.daily_steps for insert with check (auth.uid() = user_id);
create policy "Users can update own step counts" on public.daily_steps for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own step counts" on public.daily_steps for delete using (auth.uid() = user_id);
