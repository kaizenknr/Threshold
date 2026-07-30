# @kidney/api — Server API (`/v1`)

Express + TypeScript, deployed as Vercel serverless functions. The only place the
`ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are used.

## Responsibilities
- Verify the Supabase user JWT on every request (`middleware/auth.ts`).
- Gate AI endpoints on a stored consent row for the current terms version (`middleware/consent.ts`).
- Proxy **all** Anthropic calls (`lib/anthropic.ts`), prepending the §10.4 guardrails and returning strict JSON.
- Issue signed upload URLs for private buckets and read those files server-side for vision.
- Compute effective targets from the guideline engine + doctor overrides (`lib/targets*.ts`).

## Endpoints
| Method | Path | Notes |
|---|---|---|
| GET | `/v1/health` | liveness |
| GET | `/v1/targets?condition=ckd` | auth |
| POST | `/v1/uploads/sign` | auth + upload rate limit |
| POST | `/v1/ai/adapt-recipe` | auth + consent + AI rate limit |
| POST | `/v1/ai/food-check` | + web search (Sonnet 5) |
| POST | `/v1/ai/discover-recipes` | + web search (Sonnet 5) |
| POST | `/v1/ai/pantry` | vision |
| POST | `/v1/ai/estimate-macros` | cheap model |
| POST | `/v1/ai/extract-targets` | vision; stages overrides `verified:false` |
| POST | `/v1/ai/med-synopsis` | neutral summary of the user's own logs |

## Run
```bash
pnpm --filter @kidney/api dev     # tsx watch, http://localhost:8787/v1
pnpm --filter @kidney/api test    # vitest (targets engine)
pnpm --filter @kidney/api typecheck
```

## Notes
- Rate limits: AI 30/hour/user, uploads 20/day/user (in-memory token bucket; swap for Upstash
  Redis via `RATE_LIMIT_REDIS_URL` for multi-instance serverless).
- Errors never leak stack traces or provider messages — `{error:{code,message}}` only.
- Structured logs capture model + tokens + latency per call for cost tracking; no PHI, no file bytes.
- `web_search_20260209` requires enabling the web-search tool for the org in the Claude Console.
