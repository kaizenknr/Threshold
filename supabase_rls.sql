-- Row Level Security for all Threshold tables
-- Run this in the Supabase SQL editor after the initial migrations

-- landlords: public read, service role write
alter table landlords enable row level security;
create policy "Public read landlords" on landlords for select using (true);
create policy "Service role insert landlords" on landlords for insert with check (true);
create policy "Service role update landlords" on landlords for update using (true);

-- landlord_locations: public read, service role write
alter table landlord_locations enable row level security;
create policy "Public read landlord_locations" on landlord_locations for select using (true);
create policy "Service role insert landlord_locations" on landlord_locations for insert with check (true);

-- landlord_scores: public read, service role write
alter table landlord_scores enable row level security;
create policy "Public read landlord_scores" on landlord_scores for select using (true);
create policy "Service role insert landlord_scores" on landlord_scores for insert with check (true);
create policy "Service role update landlord_scores" on landlord_scores for update using (true);

-- apartment_reports: public read, service role write
alter table apartment_reports enable row level security;
create policy "Public read apartment_reports" on apartment_reports for select using (true);
create policy "Service role insert apartment_reports" on apartment_reports for insert with check (true);

-- listings: public read, service role write
alter table listings enable row level security;
create policy "Public read listings" on listings for select using (true);
create policy "Service role insert listings" on listings for insert with check (true);
create policy "Service role update listings" on listings for update using (true);
