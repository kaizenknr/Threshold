-- =========================================================================
-- Prescription tracking fields + a structured doctor-instructions table.
-- =========================================================================

-- Richer prescription fields on the existing medications table.
alter table medications add column if not exists schedule text;      -- e.g. "twice daily with food"
alter table medications add column if not exists prescriber text;
alter table medications add column if not exists notes text;
alter table medications add column if not exists started_on date;
alter table medications add column if not exists active boolean not null default true;

-- Free-text doctor instructions (distinct from numeric targets/overrides).
create table if not exists care_instructions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  condition_id text references conditions,   -- optional: which condition it's for
  instruction text not null,                  -- e.g. "Weigh yourself daily; call if up 2+ kg"
  created_at timestamptz not null default now()
);
create index if not exists care_instructions_user_idx on care_instructions (user_id);

alter table care_instructions enable row level security;
drop policy if exists "own rows" on care_instructions;
create policy "own rows" on care_instructions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
