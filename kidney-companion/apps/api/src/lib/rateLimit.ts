/**
 * Per-user token-bucket rate limiter. In-memory by default (single instance).
 * For serverless/multi-instance, back this with Upstash Redis via
 * RATE_LIMIT_REDIS_URL (left as a clearly-marked extension point — the
 * in-memory path keeps single-instance dev and small deployments correct).
 */
export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitConfig {
  /** Bucket capacity == max requests per window. */
  max: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

export function rateLimit(key: string, cfg: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const refillPerMs = cfg.max / (cfg.windowSeconds * 1000);
  const existing = buckets.get(key);
  const bucket: Bucket = existing ?? { tokens: cfg.max, updatedAt: now };

  // Refill based on elapsed time.
  const elapsed = now - bucket.updatedAt;
  bucket.tokens = Math.min(cfg.max, bucket.tokens + elapsed * refillPerMs);
  bucket.updatedAt = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    buckets.set(key, bucket);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  buckets.set(key, bucket);
  const needed = 1 - bucket.tokens;
  const retryAfterSeconds = Math.ceil(needed / refillPerMs / 1000);
  return { allowed: false, retryAfterSeconds };
}

export const AI_LIMIT: RateLimitConfig = { max: 30, windowSeconds: 3600 }; // 30/hour/user
export const UPLOAD_LIMIT: RateLimitConfig = { max: 20, windowSeconds: 86400 }; // 20/day/user
