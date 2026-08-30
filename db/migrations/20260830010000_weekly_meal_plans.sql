create table if not exists public.meal_plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  planned_date date not null,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  food_name text not null check (char_length(btrim(food_name)) between 1 and 160),
  grams numeric(8,2) not null check (grams > 0 and grams <= 5000),
  calories integer not null default 0 check (calories between 0 and 20000),
  protein_g numeric(8,2) not null default 0 check (protein_g between 0 and 2000),
  carbs_g numeric(8,2) not null default 0 check (carbs_g between 0 and 3000),
  fat_g numeric(8,2) not null default 0 check (fat_g between 0 and 2000),
  fiber_g numeric(8,2) not null default 0 check (fiber_g between 0 and 1000),
  micros jsonb not null default '{}'::jsonb check (jsonb_typeof(micros) = 'object'),
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meal_plan_completed_at_check check ((completed and completed_at is not null) or (not completed and completed_at is null))
);

create index if not exists meal_plan_items_user_date_idx on public.meal_plan_items(user_id, planned_date);
alter table public.meal_plan_items enable row level security;
drop policy if exists "Users manage own meal plans" on public.meal_plan_items;
create policy "Users manage own meal plans" on public.meal_plan_items for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
revoke all on public.meal_plan_items from anon;
grant select, insert, update, delete on public.meal_plan_items to authenticated;
