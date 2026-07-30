import type { RequestHandler } from "express";
import { verifyUserJwt } from "../lib/supabaseAdmin.js";
import { HttpError } from "./errorHandler.js";

/**
 * Verifies `Authorization: Bearer <supabase_jwt>` on every protected request
 * and sets req.userId. Rejects with 401 when absent or invalid.
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.header("authorization") ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) throw new HttpError(401, "unauthenticated", "Missing bearer token.");
    const userId = await verifyUserJwt(match[1]!);
    if (!userId) throw new HttpError(401, "unauthenticated", "Invalid or expired session.");
    req.userId = userId;
    next();
  } catch (err) {
    next(err);
  }
};
