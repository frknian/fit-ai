update public.workout_program_collections
set name = 'Fit Koç Programı', updated_at = now()
where source = 'assessment'
  and name = 'Test Sonucu Programım';
