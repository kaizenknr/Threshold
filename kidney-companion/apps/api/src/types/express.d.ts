import "express";

declare global {
  namespace Express {
    interface Request {
      /** Set by the auth middleware after verifying the Supabase JWT. */
      userId?: string;
      /** Short id for correlating structured logs (no PHI). */
      requestId?: string;
    }
  }
}
