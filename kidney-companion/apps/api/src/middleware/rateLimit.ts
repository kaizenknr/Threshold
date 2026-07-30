import type { RequestHandler } from "express";
import { rateLimit, type RateLimitConfig } from "../lib/rateLimit.js";
import { HttpError } from "./errorHandler.js";

/**
 * Per-user rate limit middleware factory. `bucket` namespaces the limiter so
 * AI and upload limits are tracked separately per user.
 */
export function rateLimitMiddleware(bucket: string, cfg: RateLimitConfig): RequestHandler {
  return (req, res, next) => {
    const key = `${bucket}:${req.userId ?? "anon"}`;
    const result = rateLimit(key, cfg);
    if (!result.allowed) {
      res.setHeader("retry-after", String(result.retryAfterSeconds));
      next(new HttpError(429, "rate_limited", "Too many requests. Please slow down."));
      return;
    }
    next();
  };
}
