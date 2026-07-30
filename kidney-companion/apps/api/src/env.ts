import "./server-only.js";
import { z } from "zod";

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  API_ALLOWED_ORIGINS: z.string().default(""),
  CONSENT_TERMS_VERSION: z.string().min(1),
  RATE_LIMIT_REDIS_URL: z.string().optional().default(""),
  RATE_LIMIT_REDIS_TOKEN: z.string().optional().default(""),
  PORT: z.coerce.number().default(8787),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // Never print values — only which keys are missing/invalid.
  const keys = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
  throw new Error(`Invalid or missing server env: ${keys}`);
}

export const env = parsed.data;

export const allowedOrigins = env.API_ALLOWED_ORIGINS.split(",")
  .map((s) => s.trim())
  .filter(Boolean);
