import { Router } from "express";
import { targetsResponse } from "@kidney/shared";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { getEffectiveTargets } from "../lib/targets.js";

export const targetsRouter = Router();

// GET /targets?condition=ckd — effective targets = guideline + overrides.
targetsRouter.get(
  "/targets",
  requireAuth,
  asyncHandler(async (req, res) => {
    const condition = typeof req.query.condition === "string" ? req.query.condition : "ckd";
    const metrics = await getEffectiveTargets(req.userId!, condition);
    res.json(targetsResponse.parse({ condition, metrics }));
  }),
);
