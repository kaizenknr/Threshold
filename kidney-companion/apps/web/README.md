# @kidney/web — Next.js (App Router)

Web client. Uses the Supabase JS SDK (anon key + user JWT) for RLS-protected CRUD and the shared
typed API client for privileged Server API calls. The service-role and Anthropic keys never appear here.

## Run
```bash
pnpm --filter @kidney/web dev     # http://localhost:3000
pnpm --filter @kidney/web build
```

## Env (client-safe only)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_BASE_URL` (e.g. `http://localhost:8787/v1`)
- `NEXT_PUBLIC_CONSENT_TERMS_VERSION` (must match the API's `CONSENT_TERMS_VERSION`)

## What's implemented
`src/app/page.tsx` is a minimal end-to-end flow: magic-link sign-in → consent gate (writes a
`consents` row) → load effective CKD targets from `/v1/targets`. It demonstrates the shared
API client + Supabase auth wiring. Port the richer prototype UI (adapt/food-check/discover/pantry/
meds screens) into `src/app/*` on top of the same `@/lib/api` client.
