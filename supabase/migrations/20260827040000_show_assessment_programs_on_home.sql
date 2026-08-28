-- Programs created from the 15-question assessment are meant to be available
-- from Home. Backfill collections created before show_on_home existed.
update public.workout_program_collections
set show_on_home = true,
    updated_at = now()
where source = 'assessment'
  and show_on_home = false;
