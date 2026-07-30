import { Router } from "express";

export const healthRouter = Router();

// GET /health — liveness. No auth.
healthRouter.get("/health", (_req, res) => {
  res.json({ ok: true });
});
