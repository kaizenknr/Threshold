# Vett — Setup Guide

## Stack
- **Frontend**: Vanilla JS / HTML / CSS — single `index.html`
- **Backend**: Vercel Serverless Functions (`/api/*.js`)
- **Database**: Supabase (Postgres)
- **AI**: Anthropic Claude (web search for landlord research)
- **Moderation**: Claude Haiku + Nominatim (free, no key needed)

---

## 1. GitHub — Create a new repo

1. Go to github.com → New repository
2. Name it `vett` (or whatever you want)
3. Push these files to `main`

```bash
cd /path/to/vett
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/vett.git
git push -u origin main
```

---

## 2. Supabase — Create the database

1. Go to supabase.com → New project
2. Run this SQL in the **SQL Editor**:

```sql
-- Landlords master list
create table landlords (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_letter text,
  created_at timestamptz default now()
);

-- Location-level data
create table landlord_locations (
  id uuid primary key default gen_random_uuid(),
  landlord_id uuid references landlords(id) on delete cascade,
  city text,
  created_at timestamptz default now()
);

-- Web research cache (30-day TTL)
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

-- Community tenant reports
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

-- Indexes for fast lookups
create index on landlord_scores (landlord_name, expires_at);
create index on apartment_reports (landlord_name);
create index on apartment_reports (landlord_id);
```

3. Under **Project Settings → API**, copy:
   - `Project URL` → this is `SUPABASE_URL`
   - `service_role` key → this is `SUPABASE_SERVICE_KEY`

---

## 3. Anthropic — Get an API key

1. Go to console.anthropic.com
2. Create an API key
3. This is `ANTHROPIC_KEY`

The app uses `claude-haiku-4-5-20251001` — costs about $0.001–0.002 per landlord lookup.

---

## 4. Vercel — Deploy

1. Go to vercel.com → Import from GitHub
2. Select your `vett` repo
3. Under **Environment Variables**, add:

| Variable | Value |
|----------|-------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Your Supabase service_role key |
| `ANTHROPIC_KEY` | Your Anthropic API key |

4. Deploy. That's it.

---

## Rename the app

To change "Vett" to your app name, find/replace in `index.html`:
- `Vett` → your name
- `vettapp.io` → your domain
- The teal color scheme is `--teal:#0d9488` and `--green:#10b981` — change to match your brand

---

## File structure

```
vett/
├── index.html                    # Full single-page app
├── package.json                  # Minimal (type: module)
├── vercel.json                   # Function timeouts
└── api/
    ├── landlord-score.js         # AI research + scoring (Claude web search)
    ├── apartment-reports.js      # Fetch + submit tenant reports
    └── moderate-report.js        # Content moderation before saving
```

---

## How scoring works

**Transparency Score (0–100)**
```
50 + (response_rate × 40) + (ghost_rate × −30) + (hidden_fee_rate × −15) + (log(report_count+1) × 5)
```
- ≥ 70 = Low risk (green)
- 40–69 = Moderate (amber)
- < 40 = High risk (red)

**Red Flag Score (0–100)**
```
ghost_rate × 30 + mold_rate × 35 + hidden_fee_rate × 25 + bait_switch_rate × 20
```
Higher = worse.

---

## What gets reported

Tenants can flag any combo of:
- Hidden fees at signing
- Listing photos inaccurate
- Mold / moisture found
- Maintenance ignored
- Non-refundable application fee
- Security deposit withheld
- Unit not as described (bait & switch)
- Pressure tactics
- Unit not ready at move-in
- Never responded to inquiry
