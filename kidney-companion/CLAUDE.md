# Kidney Companion — CLAUDE.md
# Read this at the start of every session working in kidney-companion/.

## What this is
A chronic-illness management tool (website + mobile app, one backend). First module: CKD.
**Informational tool, NOT a medical device.** Lives in `kidney-companion/`, separate from the
legacy Threshold app at the repo root.

## Load-bearing rules (do not weaken)
1. Secrets (`ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) are server-only. Never in
   `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*`, never in a client bundle, never committed. `pnpm scan:secrets` enforces this.
2. All LLM calls go through the Server API (`apps/api`); `apps/api/src/lib/anthropic.ts` is the
   ONLY place the Anthropic key is used, and it always prepends the §10.4 guardrails.
3. RLS on every user table; private storage buckets; a `consents` row is required before any AI endpoint.
4. Doctor overrides beat guideline defaults in the `/targets` engine.

## Stack
- API: Node 20 + Express + TS (Vercel serverless), Zod validation, `@anthropic-ai/sdk`.
- Web: Next.js (App Router). Mobile: Expo. Shared: `packages/shared` (Zod + types + API client + seed).
- DB/Auth/Storage: Supabase (Postgres + RLS). Monorepo: pnpm. Tests: Vitest.

## Models (verified against the current catalog)
- Reasoning: `claude-sonnet-5`. Cheap/high-volume: `claude-haiku-4-5`.
- Web search tool: `web_search_20260209` (dynamic filtering). Requires Sonnet 5 — NOT Haiku —
  so `food-check` and `discover-recipes` route to the reasoning model.

## Commands
```bash
cp .env.example .env         # fill real values
pnpm install
pnpm dev:api                 # http://localhost:8787/v1
pnpm dev:web                 # http://localhost:3000
pnpm --filter @kidney/mobile start
pnpm test                    # targets engine unit tests
pnpm typecheck
pnpm scan:secrets
```

## Database
Run in order: `supabase/migrations/0001_init.sql`, `0002_seed_ckd.sql`, `0003_storage.sql`.

## API routes (apps/api/src/routes)
- `GET  /v1/health`
- `GET  /v1/targets?condition=ckd`         — effective targets = guideline + overrides
- `POST /v1/uploads/sign`                   — signed URL to a private bucket
- `POST /v1/ai/adapt-recipe | food-check | discover-recipes | pantry | estimate-macros
        | extract-targets | med-synopsis`   — all require auth + consent + rate limit

## Build order (BUILD_SPEC §17) — status
1. Foundation (monorepo, shared, migrations, seed, CI secret-scan) — DONE
2. Auth + consent (JWT middleware, consent gate) — DONE (server side + client consent flow)
3. CRUD via Supabase SDK — enabled by RLS; clients use the anon key + JWT directly
4. Targets engine + `/targets` — DONE (pure engine unit-tested)
5. LLM proxy core (`anthropic.ts` + guardrails, adapt-recipe, estimate-macros, rate limit) — DONE
6. Uploads + vision (`/uploads/sign`, pantry, extract-targets with verified:false review) — DONE
7. Web search (food-check, discover-recipes) — DONE (enable web_search in Console to run)
8. Meds synopsis — DONE
9. Polish (mobile barcode camera, cost dashboards, RLS isolation test, compliance) — TODO

## TODO before public launch (BUILD_SPEC §16)
- RLS isolation test (user B cannot read user A's rows).
- Confirm private buckets, no public object URLs.
- Vendor data-processing terms / BAA review; confirm Anthropic retention settings for PHI.
- Attorney review of ToS, Privacy Policy, medical disclaimer.
