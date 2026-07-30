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

  app.use(
    cors({
      origin: (origin, cb) => {
        // Allow non-browser clients (no Origin) and any allowlisted origin.
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error("Not allowed by CORS"));
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

  app.use(errorHandler);
  return app;
}
