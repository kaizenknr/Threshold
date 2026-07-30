# Kidney Companion

A chronic-illness management tool. First condition module: **Chronic Kidney Disease (CKD)**.
Website + mobile app sharing one backend. **Informational tool, not a medical device.**

This monorepo lives at `kidney-companion/` inside the repo. It is independent of the
legacy Threshold app at the repo root.

## What's here

```
kidney-companion/
├─ apps/
│  ├─ api/       # Express + TS Server API (/v1) — the ONLY place secrets are used
│  ├─ web/       # Next.js (App Router)
│  └─ mobile/    # Expo (React Native)
├─ packages/
│  └─ shared/    # Zod schemas + types + typed API client + CKD guideline seed
├─ supabase/
│  └─ migrations/  # schema + RLS + CKD seed + private storage buckets
├─ scripts/secret-scan.mjs
└─ .github/workflows/ci.yml
```

## Architecture

Hybrid (see `BUILD_SPEC` §1). Clients do simple user-owned CRUD **directly** against
Supabase with the anon key + user JWT — RLS enforces ownership. Anything privileged
(all Anthropic/LLM calls, signed uploads, audited writes) goes through the **Server API**,
which holds the `ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` **server-side only**.

```
Web (Next.js)   Mobile (Expo)
      \   Supabase JS SDK (anon key + JWT) — RLS CRUD
       \                    /
        Supabase        Server API (/v1)  ── Anthropic Messages API
        Postgres+RLS    - verifies JWT      (server-only key)
        Auth+Storage    - proxies LLM
                        - signs uploads
```

## Non-negotiables

1. **No secret ever reaches a client bundle.** `ANTHROPIC_API_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
   live only in server env. CI (`pnpm scan:secrets`) fails the build if a key leaks into web/mobile.
2. **Informational, not diagnostic.** Every LLM call server-side prepends the §10.4 guardrails.
   Food checks return "generally friendly / use caution / usually limited" — never a binary verdict.
   The med feature only summarizes the user's own logs and defers to their prescriber.
3. **Treat all health data as PHI-like.** RLS on every user table, private storage buckets, a stored
   consent record required before any AI call.
4. **Doctor's instructions override guideline defaults.** The `/targets` engine computes guideline
   ranges; user/doctor overrides take precedence and are labeled "Doctor's number".

## Setup

```bash
cd kidney-companion
cp .env.example .env            # fill real values; never commit .env
pnpm install                    # workspaces: apps/* + packages/*
```

### Database (Supabase)

Run the migrations in order (Supabase SQL editor, or `supabase db push`):

1. `supabase/migrations/0001_init.sql`  — schema + RLS
2. `supabase/migrations/0002_seed_ckd.sql` — CKD reference seed (§12)
3. `supabase/migrations/0003_storage.sql` — private `doctor-docs` + `pantry` buckets

## Run / test

```bash
pnpm dev:api            # Server API at http://localhost:8787/v1
pnpm dev:web            # Next.js at http://localhost:3000
pnpm --filter @kidney/mobile start   # Expo

pnpm test               # unit tests (targets engine)
pnpm typecheck          # all workspaces
pnpm scan:secrets       # CI secret guard
```

## Deploy

- **API + Web** on Vercel (server vars unprefixed, client vars `NEXT_PUBLIC_`). Point an
  `api.` subdomain at the API app.
- **Mobile** via EAS build; public envs only (`EXPO_PUBLIC_*`).
- Enable the **web_search** tool for the org in the Claude Console (required for
  `/ai/food-check` and `/ai/discover-recipes`).

See per-app READMEs for detail, and `CLAUDE.md` for a command summary. Compliance checklist
(RLS isolation test, secret scan, private buckets, counsel review) is in `BUILD_SPEC` §16 — do
it before any public launch. This is not legal advice.
