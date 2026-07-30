-- =========================================================================
-- Private storage buckets for PHI-adjacent uploads (BUILD SPEC §9).
-- No public read. Per-user path prefix: {user_id}/...  RLS on storage.objects.
-- =========================================================================

insert into storage.buckets (id, name, public)
values ('doctor-docs', 'doctor-docs', false), ('pantry', 'pantry', false)
on conflict (id) do update set public = false;

-- A user may only touch objects whose path begins with their own uid.
-- storage.foldername(name)[1] is the first path segment.
create policy "own doctor-docs" on storage.objects for all to authenticated
  using (bucket_id = 'doctor-docs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'doctor-docs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own pantry" on storage.objects for all to authenticated
  using (bucket_id = 'pantry' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'pantry' and (storage.foldername(name))[1] = auth.uid()::text);
