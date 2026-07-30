-- =========================================================================
-- Tracking module: graphable readings, flare-ups/episodes, doctor questions,
-- and appointment reminders. All user-owned, all RLS-protected.
-- Idempotent-ish (create table if not exists guards).
-- =========================================================================

-- Generic time-series readings for anything you want to graph:
-- glucose, blood pressure (store systolic/diastolic as two rows or use note),
-- heart rate, weight, symptom severity, etc.
create table if not exists metric_readings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  condition_id text references conditions,        -- optional link to a condition
  metric_key text not null,                        -- 'glucose' | 'heart_rate' | 'symptom_severity' | free text
  label text,                                      -- optional friendly label
  value numeric not null,
  unit text,                                       -- 'mg/dL' | 'bpm' | '1-10' ...
  recorded_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists metric_readings_user_key_time_idx
  on metric_readings (user_id, metric_key, recorded_at);

-- Flare-ups / episodes.
create table if not exists episodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  condition_id text references conditions,
  title text not null,
  severity int check (severity between 1 and 10),
  started_at timestamptz not null default now(),
  ended_at timestamptz,                            -- null = ongoing
  symptoms text,                                   -- freeform or comma-separated
  triggers text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists episodes_user_time_idx on episodes (user_id, started_at desc);

-- Questions to bring to your doctor.
create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null,
  provider text,
  location text,
  scheduled_at timestamptz not null,
  reminder_at timestamptz,                         -- when to remind (client/edge fn can act on it)
  notes text,
  status text not null default 'scheduled',        -- scheduled | completed | cancelled
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists appointments_user_time_idx on appointments (user_id, scheduled_at);

create table if not exists doctor_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  condition_id text references conditions,
  appointment_id uuid references appointments on delete set null,  -- optionally attach to a visit
  question text not null,
  answered boolean not null default false,
  answer text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists doctor_questions_user_idx on doctor_questions (user_id, answered);

-- touch updated_at
create trigger episodes_touch before update on episodes
  for each row execute function set_updated_at();
create trigger appointments_touch before update on appointments
  for each row execute function set_updated_at();
create trigger doctor_questions_touch before update on doctor_questions
  for each row execute function set_updated_at();

-- RLS: each user sees only their own rows.
do $$
declare t text;
begin
  foreach t in array array['metric_readings','episodes','appointments','doctor_questions']
  loop
    execute format('alter table %I enable row level security;', t);
    -- guard against re-run duplicate policy
    execute format('drop policy if exists "own rows" on %I;', t);
    execute format(
      'create policy "own rows" on %I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid());', t);
  end loop;
end $$;
