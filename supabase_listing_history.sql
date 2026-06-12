-- Run this in Supabase SQL Editor to add listing price history tracking

create table listing_price_history (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references listings(id) on delete set null,
  landlord_name text not null,
  city text,
  space_type text,
  rent numeric not null,
  recorded_at timestamptz default now()
);

alter table listing_price_history enable row level security;

create policy "Public read listing_price_history"
  on listing_price_history for select using (true);

create policy "Service role insert listing_price_history"
  on listing_price_history for insert
  with check (true);

create index on listing_price_history (landlord_name, city);
create index on listing_price_history (listing_id);
