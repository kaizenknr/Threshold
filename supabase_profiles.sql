-- supabase_profiles.sql
-- Run this in the Supabase SQL editor AFTER the initial schema migrations.
-- Idempotent: safe to run multiple times.

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  profile_type text not null default 'renter',
  renter_type text,
  city text,
  budget numeric,
  concerns text[] default '{}',
  looking_for text[] default '{}',
  display_name text,
  contact_method text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table profiles enable row level security;

drop policy if exists "Users read own profile" on profiles;
drop policy if exists "Users upsert own profile" on profiles;
drop policy if exists "Users update own profile" on profiles;

create policy "Users read own profile" on profiles for select using (auth.uid() = id);
create policy "Users upsert own profile" on profiles for insert with check (auth.uid() = id);
create policy "Users update own profile" on profiles for update using (auth.uid() = id);

alter table listings add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists listings_user_id_idx on listings(user_id);
