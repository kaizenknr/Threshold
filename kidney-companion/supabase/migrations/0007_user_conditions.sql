-- =========================================================================
-- Allow user-created conditions (the "add your own" onboarding path).
-- Built-in conditions have created_by = NULL (global, read-only to clients).
-- A user may create/read/update/delete only their OWN conditions.
-- =========================================================================

alter table conditions add column if not exists created_by uuid references auth.users on delete cascade;

-- Replace the blanket read policy with: built-in OR your own.
drop policy if exists "reference read" on conditions;
drop policy if exists "read built-in or own" on conditions;
create policy "read built-in or own" on conditions for select to authenticated
  using (created_by is null or created_by = auth.uid());

-- Users can add their own conditions (must stamp themselves as owner).
drop policy if exists "insert own condition" on conditions;
create policy "insert own condition" on conditions for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists "update own condition" on conditions;
create policy "update own condition" on conditions for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists "delete own condition" on conditions;
create policy "delete own condition" on conditions for delete to authenticated
  using (created_by = auth.uid());
