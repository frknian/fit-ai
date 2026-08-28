-- Canonical copy: supabase/migrations/20260827040000_show_assessment_programs_on_home.sql
update public.workout_program_collections
set show_on_home = true,
    updated_at = now()
where source = 'assessment'
  and show_on_home = false;
