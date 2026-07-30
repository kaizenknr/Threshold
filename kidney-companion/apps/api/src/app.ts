import express from "express";
import cors from "cors";
import { allowedOrigins } from "./env.js";
import { errorHandler, requestContext } from "./middleware/errorHandler.js";
import { healthRouter } from "./routes/health.js";
import { targetsRouter } from "./routes/targets.js";
import { uploadsRouter } from "./routes/uploads.js";
import { aiRouter } from "./routes/ai.js";

/** Build the Express app. Mounted at /v1 by both the dev server and Vercel. */
export function createApp() {
  const app = express();
  app.disable("x-powered-by");

  // Baseline security headers (no external dep). This is a JSON API — no HTML,
  // scripts, or framing — so lock those down.
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    next();
  });

  app.use(
    cors({
      origin: (origin, cb) => {
        // Allow non-browser clients (no Origin, e.g. mobile) and any allowlisted
        // origin. Unknown origins get no CORS headers (browser blocks) rather
        // than a 500. Auth is via Bearer token, not cookies, so CORS is not the
        // security boundary here — the JWT check is.
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        cb(null, false);
      },
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(requestContext);

  const v1 = express.Router();
  v1.use(healthRouter);
  v1.use(targetsRouter);
  v1.use(uploadsRouter);
  v1.use(aiRouter);
  app.use("/v1", v1);

  // JSON 404 for anything unmatched (no HTML "Cannot GET" leakage).
  app.use((_req, res) => {
    res.status(404).json({ error: { code: "not_found", message: "Not found." } });
  });

  app.use(errorHandler);
  return app;
}
