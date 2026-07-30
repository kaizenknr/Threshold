-- =========================================================================
-- Private storage buckets for PHI-adjacent uploads (BUILD SPEC §9).
-- No public read. Per-user path prefix: {user_id}/...  RLS on storage.objects.
-- =========================================================================

-- Buckets are private, capped at ~10 MB, and restricted to images + PDF so a
-- signed upload URL cannot be used to store executables or oversized payloads.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('doctor-docs', 'doctor-docs', false, 10485760,
   array['image/jpeg','image/png','image/webp','image/gif','application/pdf']),
  ('pantry', 'pantry', false, 10485760,
   array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- A user may only touch objects whose path begins with their own uid.
-- storage.foldername(name)[1] is the first path segment.
create policy "own doctor-docs" on storage.objects for all to authenticated
  using (bucket_id = 'doctor-docs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'doctor-docs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own pantry" on storage.objects for all to authenticated
  using (bucket_id = 'pantry' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'pantry' and (storage.foldername(name))[1] = auth.uid()::text);
