create extension if not exists pg_trgm with schema extensions;

-- The first mobile food catalog used status/data_quality, while the API-facing
-- schema later introduced verified. Keep existing rows and make both versions
-- readable by the same endpoint.
-- Drop before altering foods because a SETOF table function's composite return
-- type changes when a column is added; CREATE OR REPLACE cannot change it.
drop function if exists public.search_foods(text, integer);

alter table public.foods add column if not exists verified boolean not null default false;

update public.foods
set verified = true
where data_quality = 'verified' and verified = false;

create index if not exists foods_display_name_tr_trgm_idx
  on public.foods using gin (display_name_tr extensions.gin_trgm_ops);
create index if not exists foods_canonical_name_trgm_idx
  on public.foods using gin (canonical_name extensions.gin_trgm_ops);
create index if not exists food_aliases_alias_trgm_idx
  on public.food_aliases using gin (alias extensions.gin_trgm_ops);

create or replace function public.search_foods(p_query text, p_limit integer default 10)
returns setof public.foods
language sql stable security invoker set search_path = public, extensions as $$
  select f.*
  from public.foods f
  left join public.food_aliases a on a.food_id = f.id
  where auth.uid() is not null
    and char_length(trim(p_query)) between 2 and 80
    and coalesce(to_jsonb(f) ->> 'status', 'active') = 'active'
    and (
      lower(f.display_name_tr) = lower(trim(p_query))
      or lower(f.canonical_name) = lower(trim(p_query))
      or lower(a.alias) = lower(trim(p_query))
      or f.display_name_tr ilike '%' || trim(p_query) || '%'
      or f.canonical_name ilike '%' || trim(p_query) || '%'
      or a.alias ilike '%' || trim(p_query) || '%'
      or similarity(f.display_name_tr, trim(p_query)) > 0.18
      or similarity(f.canonical_name, trim(p_query)) > 0.18
      or similarity(a.alias, trim(p_query)) > 0.18
    )
  group by f.id
  order by
    (lower(f.display_name_tr) = lower(trim(p_query))) desc,
    (lower(f.canonical_name) = lower(trim(p_query))) desc,
    (f.display_name_tr ilike trim(p_query) || '%') desc,
    max(greatest(
      similarity(f.display_name_tr, trim(p_query)),
      similarity(f.canonical_name, trim(p_query)),
      coalesce(similarity(a.alias, trim(p_query)), 0)
    )) desc,
    f.verified desc
  limit least(greatest(p_limit, 1), 24);
$$;

grant execute on function public.search_foods(text, integer) to authenticated;
