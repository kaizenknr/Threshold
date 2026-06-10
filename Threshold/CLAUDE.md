# Threshold — CLAUDE.md

---

## How to operate (read this first, every session)

### You are the sole engineer on this project. Your job is to:
1. Read this file at the start of every session to restore full context
2. Edit code, commit changes, and push to `main` — no confirmation needed for code changes
3. Never ask "should I?" for routine tasks like editing a file, fixing a bug, or adding a feature
4. When something is unclear, make a recommendation and implement it — don't stall

### Git workflow
```bash
# Stage specific files (never git add -A blindly)
git add index.html api/landlord-score.js

# Commit with a clear message
git commit -m "add recently flagged feed to landing page"

# Push
git push -u origin main
```

Always push after completing a feature or fix. This is a solo project — there are no PRs, no review process. Build, commit, push.

### Security rules — non-negotiable
These rules are absolute. No exceptions.

1. **API keys and secrets live ONLY in Vercel environment variables.** Never in code. Never in comments. Never in commit messages.
   - `SUPABASE_URL` → Vercel env var
   - `SUPABASE_SERVICE_KEY` → Vercel env var (server-side only, never in frontend HTML)
   - `ANTHROPIC_KEY` → Vercel env var
   - If you ever see a real key, token, or secret in any file, remove it immediately and flag it

2. **The Supabase service key must never appear in `index.html` or any client-side code.** It bypasses all row-level security. Frontend code uses the anon key only (safe to expose). Backend API files use the service key.

3. **No hardcoded credentials anywhere.** If a feature requires a new secret, add it as an env var in Vercel and reference it as `process.env.YOUR_VAR_NAME`.

4. **All API endpoints must validate inputs.** Sanitize and truncate user-submitted strings before writing to DB. The patterns are already in `apartment-reports.js` — follow them.

### This is a public product — always build accordingly
Every feature ships to real users. That means:

- **Content moderation runs before every report is saved.** Never skip the `moderate-report` call in the submit flow.
- **Anonymous by default.** No emails, no names, no phone numbers are collected from users reporting their experiences. Keep it that way.
- **Fail open on moderation.** If the moderation API errors, let the report through. Never block a real tenant because Claude is having a bad day.
- **No dark patterns.** No fake urgency, no hidden CTAs, no misleading copy.
- **Error messages are user-friendly.** Users see "City not recognized — try Austin, TX" not "Nominatim returned 0 results".
- **Every form validates before submitting.** Required fields are checked client-side with a `toast()` error, not just server-side.

### When adding new features
- New API endpoints go in `/api/` as new files, following the handler boilerplate pattern in this document
- New pages get a `page-yourpage` div in `index.html` and an entry in `tabMap` if they need a nav tab
- New database tables get added to `SETUP.md` so the SQL stays current
- New env vars get documented in the "Environment variables" section of this file

### What not to do
- Don't install npm packages — this project has zero dependencies intentionally
- Don't add a framework (React, Vue, etc.) — vanilla JS keeps deploys instant
- Don't use the Supabase JS client server-side — use `fetch()` against the REST API directly
- Don't put the Supabase service key in the frontend under any circumstances
- Don't skip the retry loop when calling Claude — the 429/529 handling is there for a reason

---

## What this is

**Threshold** is a rental housing transparency platform. The tagline is "Know before you sign."

The mission: eliminate information asymmetry in apartment searching. Tenants deserve to know — before paying a non-refundable application fee, before signing a lease, before moving in — whether a landlord ghosts inquiries, hides fees at signing, ignores mold complaints, or runs bait-and-switch listings.

Users can:
1. **Search** any landlord or property manager → get a Transparency Score backed by AI web research
2. **Submit** anonymous tenant reports (60 seconds, no account)
3. **Browse** what issues are most reported in their city

This was built by studying a sister product (Seen / seenjobs.io) which does the same thing for job applications. Every architectural decision below is a direct port of patterns that are already proven in production.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS + HTML + CSS — **single `index.html` file**, no framework |
| Backend | Vercel Serverless Functions (`/api/*.js`) — ES modules (`export default async function handler`) |
| Database | Supabase (Postgres) — accessed via REST API with service key, NOT the Supabase JS client |
| AI | Anthropic Claude — `claude-haiku-4-5-20251001` with `web-search-2025-03-05` beta |
| Location validation | Nominatim / OpenStreetMap — free, no API key needed |
| Deployment | Vercel — `vercel.json` sets per-function timeouts |

**Why single HTML file:** No build step. Vercel deploys instantly. Easy to reason about. The sister product (seenjobs.io) runs 47k+ scored companies on this exact pattern.

---

## File structure

```
threshold/
├── index.html                    # Complete SPA — all CSS, HTML, JS inline
├── package.json                  # { "type": "module" } only
├── vercel.json                   # Function timeout configs
├── SETUP.md                      # Supabase SQL + deploy instructions
└── api/
    ├── landlord-score.js         # AI web research + scoring (45s timeout)
    ├── apartment-reports.js      # Fetch + submit tenant reports (20s)
    └── moderate-report.js        # Content moderation before saving (20s)
```

---

## Environment variables

Set these in Vercel project settings. Never put them in code.

```
SUPABASE_URL           # https://your-project.supabase.co
SUPABASE_SERVICE_KEY   # service_role key (bypasses RLS — server-side only)
ANTHROPIC_KEY          # Anthropic console.anthropic.com API key
```

The frontend uses the Supabase **anon** key (public, safe to expose) if needed for auth later. The service key is backend-only.

---

## Database schema

Tables in Supabase. Run this SQL exactly in the SQL editor:

```sql
-- Master landlord/PM list
create table landlords (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_letter text,
  created_at timestamptz default now()
);

-- City-level location data
create table landlord_locations (
  id uuid primary key default gen_random_uuid(),
  landlord_id uuid references landlords(id) on delete cascade,
  city text,
  created_at timestamptz default now()
);

-- Web research cache (30-day TTL via expires_at)
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

-- Anonymous tenant reports
create table apartment_reports (
  id uuid primary key default gen_random_uuid(),
  landlord_id uuid references landlords(id) on delete set null,
  landlord_name text,
  location_id uuid references landlord_locations(id) on delete set null,
  address text,
  unit_type text,
  platform text,
  outcome text,             -- rented | passed | ghosted | fee_lost | looking
  issues text[] default '{}',
  app_fee numeric,
  app_fee_refunded text default 'na',  -- yes | no | partial | na
  experience_text text,
  source text default 'direct',
  created_at timestamptz default now()
);

-- Indexes for fast lookups
create index on landlord_scores (landlord_name, expires_at);
create index on apartment_reports (landlord_name);
create index on apartment_reports (landlord_id);
```

---

## Supabase REST API — exact patterns

**Never use the Supabase JS client server-side.** Use `fetch()` directly against the REST API with the service key. This is what all three API files do.

### Headers (always the same)
```javascript
const dbHeaders = {
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
};
```

### Query patterns
```javascript
// ilike (case-insensitive) — ALWAYS encodeURIComponent the value
const nameEnc = encodeURIComponent(name.toLowerCase().trim());
fetch(`${SUPABASE_URL}/rest/v1/landlord_scores?landlord_name=ilike.${nameEnc}&limit=1`, { headers })

// ilike with wildcard (partial match)
const word = encodeURIComponent(`*${firstWord}*`);
fetch(`${SUPABASE_URL}/rest/v1/landlords?name=ilike.${word}&select=id,name&limit=20`, { headers })

// Cache hit check (expires_at > now)
const now = encodeURIComponent(new Date().toISOString());
fetch(`${SUPABASE_URL}/rest/v1/landlord_scores?landlord_name=ilike.${nameEnc}&expires_at=gt.${now}&order=created_at.desc&limit=1`, { headers })

// Multiple filters
fetch(`${SUPABASE_URL}/rest/v1/landlord_locations?landlord_id=eq.${lid}&city=ilike.${cityEnc}&select=id&limit=1`, { headers })

// IN query (for IDs)
fetch(`${SUPABASE_URL}/rest/v1/landlord_locations?id=in.(${ids.join(',')})&select=id,city&limit=100`, { headers })
```

### Insert patterns
```javascript
// Insert and get back the row (use when you need the new ID)
const res = await fetch(`${SUPABASE_URL}/rest/v1/landlords`, {
  method: 'POST',
  headers: { ...dbHeaders, Prefer: 'return=representation' },
  body: JSON.stringify({ name: safeName, logo_letter: safeName[0]?.toUpperCase() || '?' })
});
const rows = await res.json();
const id = Array.isArray(rows) ? rows[0]?.id : rows?.id;

// Insert silently (no row returned, saves bandwidth)
await fetch(`${SUPABASE_URL}/rest/v1/apartment_reports`, {
  method: 'POST',
  headers: { ...dbHeaders, Prefer: 'return=minimal' },
  body: JSON.stringify(reportData)
});

// Upsert (insert or replace on conflict)
await fetch(`${SUPABASE_URL}/rest/v1/landlord_scores`, {
  method: 'POST',
  headers: { ...dbHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify(scoreRow)
});

// Insert, skip if duplicate
await fetch(`${SUPABASE_URL}/rest/v1/landlord_scores`, {
  method: 'POST',
  headers: { ...dbHeaders, Prefer: 'resolution=ignore-duplicates,return=minimal' },
  body: JSON.stringify(scoreRow)
});
```

### 400 error recovery pattern (CRITICAL)
When adding new columns to an existing table, the column might not exist in production yet. Always handle this:
```javascript
let saveRes = await fetch(`${SUPABASE_URL}/rest/v1/landlord_scores`, {
  method: 'POST',
  headers: { ...dbHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify({ ...rowBase, web_reviews: reviews }), // new column
});
if (!saveRes.ok && saveRes.status === 400) {
  const errText = await saveRes.text();
  if (errText.includes('web_reviews') || errText.includes('column')) {
    // Column doesn't exist yet — retry without it
    saveRes = await fetch(`${SUPABASE_URL}/rest/v1/landlord_scores`, {
      method: 'POST',
      headers: { ...dbHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rowBase),
    });
  }
}
```

---

## Claude API — exact patterns

### Required headers
```javascript
{
  'Content-Type': 'application/json',
  'x-api-key': ANTHROPIC_KEY,
  'anthropic-version': '2023-06-01',
  'anthropic-beta': 'web-search-2025-03-05',  // REQUIRED for web search tool
}
```

### Model
Always use `claude-haiku-4-5-20251001`. It's fast and cheap (~$0.001–0.002 per research call). Do not use Sonnet or Opus for automated scoring — too expensive for per-query use.

### Web search tool definition
```javascript
tools: [{ type: 'web_search_20250305', name: 'web_search' }]
```

### Full API call with retry loop
```javascript
let apiRes;
for (let attempt = 0; attempt < 3; attempt++) {
  if (attempt > 0) {
    const retryAfter = apiRes?.headers?.get('retry-after');
    const waitMs = retryAfter
      ? Math.min(parseInt(retryAfter) * 1000, 15000)
      : attempt * 4000; // 4s, 8s
    await new Promise(r => setTimeout(r, waitMs));
  }
  apiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'web-search-2025-03-05',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })
  });
  if (apiRes.status !== 429 && apiRes.status !== 529) break;
}
if (!apiRes.ok) {
  const err = await apiRes.text();
  return res.status(502).json({ error: 'Claude API error', detail: err.slice(0, 150) });
}
```

### JSON extraction from response (handles markdown code fences)
```javascript
const data = await apiRes.json();
const text = (data.content || [])
  .filter(b => b.type === 'text')
  .map(b => b.text)
  .join('');

// Strip markdown code fence wrappers (Claude sometimes wraps JSON in ```json)
const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
const match = clean.match(/\{[\s\S]*\}/);
if (!match) throw new Error('no JSON found');
const parsed = JSON.parse(match[0]);
```

**Always** wrap JSON parsing in try/catch. Never trust the raw response shape.

---

## Scoring formulas

### Transparency Score (0–100)
```javascript
function calcTransparencyScore(responseRate, ghostRate, hiddenFeeRate, reportCount) {
  return Math.max(0, Math.min(100, Math.round(
    50
    + (responseRate * 40)    // good: responsive landlords score higher
    + (ghostRate * -30)      // bad: ghosting tanks the score
    + (hiddenFeeRate * -15)  // bad: hidden fees penalize
    + (Math.log(reportCount + 1) * 5)  // confidence: more reports = higher ceiling
  )));
}
```
- `responseRate` and `ghostRate` are 0.0–1.0 floats
- ≥ 70 = low risk (green), 40–69 = moderate (amber), < 40 = high risk (red)

### Red Flag Score (0–100)
```javascript
function calcRedFlagScore(ghostRate, moldRate, hiddenFeeRate, baitSwitchRate) {
  return Math.max(0, Math.min(100, Math.round(
    ghostRate * 30        // ghost = 30% weight
    + moldRate * 35       // mold = heaviest (health issue)
    + hiddenFeeRate * 25  // fees = significant
    + baitSwitchRate * 20 // bait-switch = concerning
  )));
}
```
Higher = worse. A score above 50 means proceed very carefully.

### Risk level
```javascript
const riskLevel = score >= 70 ? 'safe' : score >= 40 ? 'warn' : 'danger';
```

### Input clamping (always do this before computing)
```javascript
const gr  = Math.max(0, Math.min(1, Number(parsed.ghost_rate) || 0));
const rr  = Math.max(0, Math.min(1, Number(parsed.response_rate) || 0));
const hfr = Math.max(0, Math.min(1, Number(parsed.hidden_fee_rate) || 0));
const mol = Math.max(0, Math.min(1, Number(parsed.mold_rate) || 0));
const bsr = Math.max(0, Math.min(1, Number(parsed.bait_switch_rate) || 0));
const rd  = Math.max(1, Math.min(60, Number(parsed.avg_response_days) || 7));
const cnt = Math.max(1, Number(parsed.report_count) || 5);
```

---

## Name normalization (exact regex)

Strip legal suffixes before comparing landlord names:
```javascript
const normalize = n => n ? n.trim().toLowerCase()
  .replace(/[\s,]+(llc\.?|inc\.?|corp\.?|ltd\.?|co\.|plc\.?|properties|management|realty|group|apartments|holdings)\.?$/i, '')
  .trim() : '';
```

Use this when:
- Looking up existing landlords in DB (avoid "Greystar LLC" and "Greystar" creating two records)
- Comparing report landlord name to DB record

---

## Caching strategy

### 30-day cache for landlord scores
The Claude web search costs real money. Cache every result for 30 days:
```javascript
const SCORE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const expires_at = new Date(Date.now() + SCORE_TTL_MS).toISOString();
```

### Cache hit check
```javascript
const now = encodeURIComponent(new Date().toISOString());
const nameEnc = encodeURIComponent(name.toLowerCase().trim());
const cacheRes = await fetch(
  `${SUPABASE_URL}/rest/v1/landlord_scores?landlord_name=ilike.${nameEnc}&expires_at=gt.${now}&order=created_at.desc&limit=1`,
  { headers: dbHeaders }
);
if (cacheRes.ok) {
  const rows = await cacheRes.json();
  if (rows?.[0]) {
    return res.json({ ok: true, score: rowToScore(rows[0]), _src: 'cache' });
  }
}
// Cache miss → call Claude
```

### Force refresh
Accept a `force_refresh: true` body param. Use `resolution=merge-duplicates` instead of `ignore-duplicates` when saving.

---

## Content moderation

### Philosophy: FAIL OPEN
If Claude is down, if Nominatim times out, if anything errors — let the user submit. Never block a legitimate report because of infrastructure failure.

### Nominatim location validation (free, no key)
```javascript
const geoRes = await fetch(
  `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1&addressdetails=1`,
  {
    headers: { 'User-Agent': 'Threshold-RentalTransparency/1.0' },
    signal: AbortSignal.timeout(6000), // never block the user more than 6s
  }
);
if (geoRes.ok) {
  const places = await geoRes.json();
  if (!places?.length) {
    // city not recognized — flag it, but still allow submit if you want
  } else {
    const addr = places[0].address || {};
    const normalized = [
      addr.city || addr.town || addr.village || addr.county,
      addr.state
    ].filter(Boolean).join(', ');
  }
}
```

### Claude moderation prompt pattern
```javascript
// Keep it tight — Haiku is fast but prompt length matters
const prompt = `You moderate reports on a rental transparency platform. Review this submission.

Landlord: "${landlord}"
City: "${city}"
Report: "${experienceText.slice(0, 1000)}"

Flag ONLY: personal info about individuals (names, phones, addresses), hate speech, slurs, obviously fake content (gibberish, keyboard mashing).

Do NOT flag: negative opinions of landlords, complaints about business practices, strong language about a company.

Return ONLY valid JSON:
{"ok": true, "reason": null}
or
{"ok": false, "reason": "brief reason"}`;
```

---

## Frontend architecture

### Page routing pattern
```javascript
// Pages: page-landing, page-search, page-landlord, page-report, page-faq
// Nav tabs: nt-search, nt-report, nt-faq

const tabMap = { search: 'nt-search', report: 'nt-report', faq: 'nt-faq' };

function go(page) {
  document.querySelectorAll('.page, .page-full').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page)?.classList.add('active');
  document.querySelectorAll('.ntab').forEach(t => t.classList.remove('active'));
  if (tabMap[page]) document.getElementById(tabMap[page])?.classList.add('active');
  window.scrollTo(0, 0);
  // Page-specific init hooks go here
  if (page === 'faq') renderFAQ();
}
```

### CSS page show/hide
```css
.page { display: none; min-height: 100vh; padding-top: 58px; }
.page.active { display: block; animation: pageIn 0.25s cubic-bezier(0.22,1,0.36,1) both; }
.page-full { display: none; height: 100vh; overflow: hidden; padding-top: 58px; }
.page-full.active { display: flex; flex-direction: column; }
@keyframes pageIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
```

### CSS design system
The app uses a **teal/green** color scheme (to differentiate from seenjobs' blue/purple):
```css
:root {
  /* Backgrounds */
  --ink: #02040a;
  --surface: #0c0f1a;
  --card: rgba(255,255,255,0.03);
  --raised: rgba(255,255,255,0.05);
  --line: rgba(255,255,255,0.08);
  --line2: rgba(255,255,255,0.12);

  /* Text */
  --muted: #4b5563;
  --dim: #6b7280;
  --sub: #9ca3af;
  --text: #e5e7eb;
  --white: #f9fafb;

  /* Semantic colors */
  --green: #10b981;
  --red: #ef4444;
  --amber: #f59e0b;
  --teal: #0d9488;  /* primary brand color */

  /* Dimmed/mid versions for backgrounds */
  --gdim: rgba(16,185,129,0.08);
  --rdim: rgba(239,68,68,0.08);
  --adim: rgba(245,158,11,0.08);
  --tdim: rgba(13,148,136,0.1);

  /* Typography */
  --display: 'Syne', sans-serif;    /* headings */
  --mono: 'DM Mono', monospace;     /* labels, badges, data */
  --body: 'Instrument Sans', sans-serif;  /* body text */
}
```

Google Fonts import (put in `<head>`):
```html
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:ital,wght@0,300;0,400;0,500;1,400&family=Instrument+Sans:ital,wght@0,300;0,400;0,500;0,600;1,300&display=swap" rel="stylesheet"/>
```

### Score ring component
```html
<!-- Usage: <div class="sring safe" style="width:80px;height:80px">
              <span class="sring-n" style="font-size:1.5rem">74</span>
              <span class="sring-l">Transparency</span>
            </div> -->
```
```css
.sring { display:flex; flex-direction:column; align-items:center; justify-content:center; border-radius:50%; border:2px solid; position:relative; }
.sring::after { content:''; position:absolute; inset:-4px; border-radius:50%; border:1px solid; opacity:.4; }
.sring.safe  { border-color:var(--green); background:rgba(16,185,129,0.1); box-shadow:0 0 20px rgba(16,185,129,0.3); }
.sring.warn  { border-color:var(--amber); background:var(--adim); box-shadow:0 0 20px rgba(245,158,11,0.3); }
.sring.danger{ border-color:var(--red);   background:var(--rdim); box-shadow:0 0 20px rgba(239,68,68,0.3); }
.sring.safe  .sring-n { color:var(--green); }
.sring.warn  .sring-n { color:var(--amber); }
.sring.danger.sring-n { color:var(--red);   }
.sring-n { font-family:var(--mono); font-weight:500; line-height:1; }
.sring-l { font-family:var(--mono); font-size:.46rem; letter-spacing:.07em; margin-top:.08rem; }
```

### Toast notifications
```javascript
function toast(msg, type = 'default') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.borderColor = type === 'error' ? 'rgba(239,68,68,0.3)'
    : type === 'success' ? 'rgba(16,185,129,0.3)' : 'var(--line2)';
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3200);
}
```
```css
.toast { position:fixed; bottom:1.5rem; left:50%; transform:translateX(-50%) translateY(20px); background:var(--surface); border:1px solid var(--line2); border-radius:10px; padding:.65rem 1.25rem; font-family:var(--mono); font-size:.72rem; color:var(--white); z-index:9999; opacity:0; transition:all .25s ease; pointer-events:none; white-space:nowrap; }
.toast.show { opacity:1; transform:translateX(-50%) translateY(0); }
```

---

## Vercel configuration

```json
{
  "functions": {
    "api/landlord-score.js":     { "maxDuration": 45 },
    "api/apartment-reports.js":  { "maxDuration": 20 },
    "api/moderate-report.js":    { "maxDuration": 20 }
  }
}
```

**Why these timeouts:**
- `landlord-score.js` needs 45s because Claude web search takes 15–20s and we retry 3x
- `apartment-reports.js` needs 20s — it's just DB reads/writes, no AI
- `moderate-report.js` needs 20s — one Nominatim call (6s timeout) + one Claude call

---

## API handler boilerplate

Every `/api/*.js` file starts like this:
```javascript
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end('Method not allowed');

  let body = req.body;
  if (typeof body === 'string') try { body = JSON.parse(body); } catch (e) { body = {}; }
  body = body || {};

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'DB not configured' });
  }
  // ...
}
```

---

## Known gotchas

1. **Body parsing** — Vercel sometimes delivers `req.body` as a string (already JSON-stringified). Always do: `if (typeof body === 'string') try { body = JSON.parse(body); } catch...`

2. **Claude web search is slow** — Expect 10–25s per call. Set timeouts accordingly. 3 retries at 4s/8s backoff = max ~47s. That's why landlord-score has a 45s timeout.

3. **Nominatim rate limit** — 1 request/second. For single-user moderation calls this is fine. Don't batch Nominatim calls. Always include `User-Agent` header or requests get blocked.

4. **ilike must use encodeURIComponent** — Spaces and special characters in landlord names break the query URL. Always encode. Always.

5. **Prefer header merging** — When you spread `...dbHeaders` and then add `Prefer`, the Prefer key goes last, which is correct. Don't put `Prefer` inside `dbHeaders` — it needs to vary per call.

6. **Array columns in Supabase** — `issues text[]` stores as a Postgres array. Insert it as a JS array and Supabase serializes it correctly. When reading it back, it comes as a JS array already.

7. **Claude returns markdown sometimes** — Even with "Return ONLY valid JSON" in the prompt, Claude Haiku occasionally wraps the JSON in a ```json ... ``` block. Always strip with: `.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()` before parsing.

8. **Fail open on moderation** — If Claude is down or rate limited, return `{ ok: true }` and let the report through. A platform with no moderation is better than one where legitimate tenants can't submit.

9. **Supabase returns arrays even for single-row inserts** — When you `Prefer: return=representation`, you get `[{...}]` not `{...}`. Always handle both: `Array.isArray(rows) ? rows[0]?.id : rows?.id`.

10. **Safari page discard** — Safari can discard the JS state while keeping the tab. Persist navigation state in `localStorage` if you add multi-page flows later.

11. **`resolution=merge-duplicates` requires a unique constraint** — If upsert isn't working, check that the target table has a unique index on the conflict column (e.g., `landlord_name`). Add it: `create unique index on landlord_scores (landlord_name);`

---

## What issues tenants can report

The 10 issue flags stored in `apartment_reports.issues[]`:
```
hidden_fees          Hidden fees at signing
listing_inaccurate   Listing photos/description inaccurate
mold                 Mold / moisture found
maintenance_ignored  Maintenance requests ignored
predatory_app_fee    Non-refundable application fee charged
deposit_withheld     Security deposit not returned
bait_switch          Unit not as described (bait & switch)
pressure_tactics     Pressure tactics ("sign today or lose it")
unit_not_ready       Unit not ready at move-in
no_response          Never responded to inquiry
```

Outcomes stored in `apartment_reports.outcome`:
```
rented      Rented here
passed      Toured and passed (chose not to rent)
ghosted     Landlord stopped responding
fee_lost    Paid application fee, never got the unit
looking     Still in the process
```

---

## Current state

The three API files (`landlord-score.js`, `apartment-reports.js`, `moderate-report.js`) and the full `index.html` are complete and ready to deploy. The `SETUP.md` has the full Supabase SQL and deploy steps.

What would make this better next:
- **Recently flagged feed** on landing page (query apartment_reports ordered by created_at, group by landlord)
- **City leaderboard** — most-reported issues by metro
- **Landlord alias map** — same as seenjobs uses for AWS→Amazon (e.g., "Greystar" → "Greystar Real Estate Partners")
- **Share card** — generate a card for a landlord score that's shareable on social
- **Email alerts** — "Get notified when someone reports [Landlord X]"
