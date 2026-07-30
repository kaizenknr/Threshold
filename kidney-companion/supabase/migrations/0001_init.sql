-- =========================================================================
-- Kidney Companion — schema + Row-Level Security (BUILD SPEC §5)
-- Generalized so new conditions are DATA, not code.
-- Every user table: RLS on, policies scoped to user_id = auth.uid().
-- Reference tables (conditions, condition_metrics, guidelines): read-only.
-- =========================================================================

-- gen_random_uuid() lives in pgcrypto on older Postgres; safe to ensure.
create extension if not exists pgcrypto;

-- updated_at auto-touch --------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------------------------
-- Consent record (proof of acceptance; version + timestamp)
-- ------------------------------------------------------------------------
create table consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  terms_version text not null,
  accepted_at timestamptz not null default now()
);
create index consents_user_idx on consents (user_id, terms_version);

-- ------------------------------------------------------------------------
-- CONDITION FRAMEWORK (reference data; not user-owned)
-- ------------------------------------------------------------------------
create table conditions (
  id text primary key,             -- 'ckd'
  name text not null,
  active boolean not null default true
);

create table condition_metrics (
  id text primary key,             -- 'ckd.sodium'
  condition_id text not null references conditions,
  key text not null,               -- 'sodium'
  label text not null,
  unit text not null,              -- 'mg/day'
  conditional boolean not null default false,   -- 'only if advised'
  sort int not null default 0
);
create index condition_metrics_condition_idx on condition_metrics (condition_id, sort);

create table guidelines (
  id uuid primary key default gen_random_uuid(),
  metric_id text not null references condition_metrics,
  rule jsonb not null,             -- {"kind":"range",...} | {"kind":"protein_band",...}
  source text not null,            -- 'KDOQI 2020' | 'National Kidney Foundation'
  source_url text,
  version text not null,           -- 'kdoqi-2020'
  effective_from date not null default current_date
);
create index guidelines_metric_idx on guidelines (metric_id);

-- ------------------------------------------------------------------------
-- USER DATA (RLS-protected)
-- ------------------------------------------------------------------------
create table health_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  condition_id text not null references conditions default 'ckd',
  stage text not null default 'nondialysis',    -- early | nondialysis | dialysis
  diabetes boolean not null default false,
  weight_kg numeric,                             -- canonical kg
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, condition_id)
);
create trigger health_profiles_touch before update on health_profiles
  for each row execute function set_updated_at();

create table target_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  condition_id text not null default 'ckd',
  metric_key text not null,                      -- 'sodium' or a custom label
  value text not null,                           -- as written by/for the doctor
  is_custom boolean not null default false,
  source text not null default 'doctor',         -- 'doctor' | 'doc_upload'
  verified boolean not null default false,       -- false until user confirms an upload read
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index target_overrides_user_idx on target_overrides (user_id, condition_id);
create trigger target_overrides_touch before update on target_overrides
  for each row execute function set_updated_at();

create table doctor_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  storage_path text not null,                    -- private bucket path
  extracted jsonb,                               -- what the LLM read (for user review)
  created_at timestamptz not null default now()
);
create index doctor_documents_user_idx on doctor_documents (user_id);

create table recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null,
  kind text not null,                            -- adapted | web | custom
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index recipes_user_idx on recipes (user_id);

create table food_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  logged_on date not null default current_date,
  label text not null,
  sodium_mg numeric, potassium_mg numeric, phosphorus_mg numeric,
  protein_g numeric, calories numeric,
  estimated boolean not null default true,
  created_at timestamptz not null default now()
);
create index food_log_user_day_idx on food_log (user_id, logged_on);

create table medications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  dose text,
  created_at timestamptz not null default now()
);
create index medications_user_idx on medications (user_id);

create table medication_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  medication_id uuid not null references medications on delete cascade,
  taken_at timestamptz not null,
  effectiveness int check (effectiveness between 1 and 5),
  side_effects text,
  created_at timestamptz not null default now()
);
create index medication_logs_user_med_idx on medication_logs (user_id, medication_id, taken_at);

-- ========================================================================
-- Row-Level Security
-- ========================================================================

-- Reference tables: readable by any authenticated client, never client-writable.
alter table conditions enable row level security;
alter table condition_metrics enable row level security;
alter table guidelines enable row level security;
create policy "reference read" on conditions for select to authenticated using (true);
create policy "reference read" on condition_metrics for select to authenticated using (true);
create policy "reference read" on guidelines for select to authenticated using (true);
-- (No insert/update/delete policies => writes are blocked for anon/authenticated;
--  the service role bypasses RLS for seeding and guideline updates.)

-- User tables: full CRUD limited to the owning user.
do $$
declare t text;
begin
  foreach t in array array[
    'consents','health_profiles','target_overrides','doctor_documents',
    'recipes','food_log','medications','medication_logs'
  ]
  loop
    execute format('alter table %I enable row level security;', t);
    execute format(
      'create policy "own rows" on %I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid());', t);
  end loop;
end $$;
