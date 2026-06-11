# Threshold — CLAUDE.md
# Read this at the start of every session.

## What this is
Threshold is a rental intelligence platform — Zillow + Glassdoor + Yelp for renters.
Tenants search any landlord or address and see risk scores, fee breakdowns, violations,
eviction history, and a full property timeline. Anonymous, free, community-powered.

## Your job
- You are the sole engineer. Build, commit, push — no confirmation needed for code changes.
- When something is unclear, make a recommendation and implement it.
- Always push after completing a feature or fix.

## Stack
- Frontend: React (Vite) in `frontend/` — deployed to Vercel
- Backend: Node.js + Express in `backend/` — deployed to Railway
- Database: Supabase (PostgreSQL)
- CI/CD: GitHub Actions (`.github/workflows/deploy.yml`) — auto-deploys on every push to main

## Git workflow
```bash
git add frontend/src/App.jsx          # stage specific files, never git add -A blindly
git commit -m "fix: description"
git push origin main                  # triggers auto-deploy to Vercel + Railway
```

## Security rules — non-negotiable
1. `SUPABASE_SERVICE_ROLE_KEY` lives ONLY in Railway env vars. Never in frontend code. Never committed.
2. Frontend uses `VITE_SUPABASE_ANON_KEY` only — this is safe to expose.
3. No hardcoded secrets anywhere. All secrets are environment variables.
4. All user input sanitized before DB write.
5. Content moderation runs before every review is saved.
6. No PII collected ever — submissions use a one-way hash only.

## Environment variables

### Vercel (frontend)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_URL` (Railway backend URL)

### Railway (backend)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `HUD_API_TOKEN` (already obtained by Kyra)
- `HASH_SALT` (any random 32-char string)
- `NODE_ENV=production`
- `ALLOWED_ORIGINS` (Vercel URL)

### GitHub Secrets (for Actions deploy)
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `RAILWAY_TOKEN`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_URL`

## Database (Supabase)
Run these SQL files in Supabase SQL editor in order:
1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_functions_and_rls.sql`

### Key tables
- `properties` — canonical addresses, risk scores, geocoords
- `landlords` — owner records, portfolio risk, verified flag
- `ownership_records` — property-to-landlord links, history
- `rental_listings` — active listings, price, photos, source
- `listing_price_history` — every observed price point
- `tenant_reviews` — anonymous reports, 1-10 scores, moderation status
- `fee_reports` — structured fee complaints
- `maintenance_events` — issue type, severity, resolution time
- `violations` — LAHD code enforcement, habitability
- `eviction_records` — court filings, outcomes
- `property_timeline` — unified event log (auto-populated by DB triggers)
- `risk_assessments` — AI engine output + confidence scores
- `neighborhood_stats` — ZIP/city aggregates
- `hud_fmr` — HUD Fair Market Rents by ZIP
- `census_acs` — median rent by census tract

## API routes (backend/src/server.js)
- `GET  /health` — health check
- `GET  /api/search` — fuzzy property + landlord search
- `GET  /api/properties/:id` — full property detail
- `GET  /api/properties/:id/timeline` — filtered timeline
- `GET  /api/landlords/:id` — landlord portfolio
- `GET  /api/neighborhoods/:geoType/:geoId` — neighborhood stats
- `POST /api/reviews` — submit anonymous review

## Risk scoring (backend/src/engine/risk.js)
- Scale: 0-10, higher = more risky
- Community signals: 60% (review scores, inverted)
- Government signals: 25% (violations x severity, evictions)
- Market signals: 15% (rent vs HUD FMR, price volatility)
- Ghost rate detection adds up to +2.0
- Fee severity multipliers add up to +1.5 per type
- Confidence score: 0-1 based on data volume

## Free APIs already wired
- Census Geocoder — no key needed, normalizes addresses to lat/lng + census tract
- HUD Fair Market Rents — Kyra has the bearer token
- Census ACS 5-year — no key needed, median rent by census tract
- LAHD open data — LA code enforcement violations, no key needed

## Design system
- Background: `#08070a` (obsidian), `#111018`, `#1a1922`
- Text: `#f5f3f0` (warm white), `#ede9e3` (ivory), `#a8a29e` (platinum)
- Accent: `#e8d5c4` (champagne), `#c4a882` (gold)
- Risk colors: `#c9404a` (high/red), `#d4a847` (moderate/amber), `#dce6f0` (low/ice)
- NO green anywhere
- Fonts: Playfair Display (headlines), Inter (body), DM Mono (data labels)
- Mobile-first, bottom tab navigation (Home / Search / Saved / Report)

## What needs to happen to go live
1. Run both SQL migration files in Supabase SQL editor
2. Create Railway project pointed at `backend/` folder
3. Add all Railway env vars listed above
4. Create Vercel project pointed at `frontend/` folder
5. Add all Vercel env vars listed above
6. Add all GitHub Secrets listed above
7. Push to main — GitHub Actions will deploy both automatically
8. Seed a few LA properties so the site is not empty on launch
9. Test the review submission flow end to end
10. Domain: do NOT add yet — wait until site is fully working,
    data is flowing, and review submission is tested. Then advise Kyra on timing.

## File structure
```
threshold/
  frontend/
    src/
      App.jsx        <- entire React app (1100+ lines)
      main.jsx       <- entry point
    index.html
    package.json
    vite.config.js
  backend/
    src/
      server.js      <- Express API + cron jobs
      engine/
        risk.js      <- risk scoring engine
    package.json
  supabase/
    migrations/
      001_initial_schema.sql
      002_functions_and_rls.sql
  .github/
    workflows/
      deploy.yml     <- auto-deploy on push to main
  .gitignore
  CLAUDE.md          <- this file
  package.json
```
