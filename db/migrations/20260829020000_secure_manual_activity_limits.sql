-- Manual sport logs reuse workout_sessions so they appear in the existing
-- progress history. These limits are enforced for every new client insert.
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.workout_sessions'::regclass and conname = 'workout_sessions_duration_upper_bound') then
    alter table public.workout_sessions add constraint workout_sessions_duration_upper_bound
      check (duration_seconds between 1 and 21600) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.workout_sessions'::regclass and conname = 'workout_sessions_calories_upper_bound') then
    alter table public.workout_sessions add constraint workout_sessions_calories_upper_bound
      check (calories between 0 and 10000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.workout_sessions'::regclass and conname = 'workout_sessions_feedback_note_length') then
    alter table public.workout_sessions add constraint workout_sessions_feedback_note_length
      check (feedback_note is null or char_length(feedback_note) <= 500) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.workout_sessions'::regclass and conname = 'workout_sessions_exercise_names_array') then
    alter table public.workout_sessions add constraint workout_sessions_exercise_names_array
      check (jsonb_typeof(exercise_names) = 'array') not valid;
  end if;
end $$;
