import type { RequestHandler } from "express";
import { env } from "../env.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { HttpError } from "./errorHandler.js";

/**
 * Gate AI endpoints on a stored consent row for the CURRENT terms version
 * (BUILD SPEC §6). Otherwise 403 consent_required. Runs after requireAuth.
 */
export const requireConsent: RequestHandler = async (req, _res, next) => {
  try {
    if (!req.userId) throw new HttpError(401, "unauthenticated", "Missing user.");
    const { data, error } = await supabaseAdmin
      .from("consents")
      .select("id")
      .eq("user_id", req.userId)
      .eq("terms_version", env.CONSENT_TERMS_VERSION)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(403, "consent_required", "Accept the current terms to continue.");
    next();
  } catch (err) {
    next(err);
  }
};
