-- Run this entire block in Supabase SQL Editor (one paste, one click Run)

create table landlords (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_letter text,
  created_at timestamptz default now()
);

create table landlord_locations (
  id uuid primary key default gen_random_uuid(),
  landlord_id uuid references landlords(id) on delete cascade,
  city text,
  created_at timestamptz default now()
);

create table landlord_scores (
  id uuid primary key default gen_random_uuid(),
  landlord_name text not null,
  overall_score int,
  ghost_rate float,
  response_rate float,
  hidden_fee_rate float,
  mold_rate float,
  bait_switch_rate float,
  app_fee_predatory boolean default false,
  avg_response_days int,
  red_flag_score int,
  report_count int,
  data_quality text,
  data_source text,
  property_type text,
  raw_summary text,
  web_reviews jsonb,
  expires_at timestamptz,
  created_at timestamptz default now()
);

create table apartment_reports (
  id uuid primary key default gen_random_uuid(),
  landlord_id uuid references landlords(id) on delete set null,
  landlord_name text,
  location_id uuid references landlord_locations(id) on delete set null,
  address text,
  unit_type text,
  platform text,
  outcome text,
  issues text[] default '{}',
  app_fee numeric,
  app_fee_refunded text default 'na',
  experience_text text,
  source text default 'direct',
  created_at timestamptz default now()
);

create index on landlord_scores (landlord_name, expires_at);
create index on apartment_reports (landlord_name);
create index on apartment_reports (landlord_id);
