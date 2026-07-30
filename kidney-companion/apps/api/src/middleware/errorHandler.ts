import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { ConfigError } from "../lib/anthropic.js";

/** Assign a request id and never crash on a thrown async handler. */
export const requestContext: RequestHandler = (req, _res, next) => {
  req.requestId = Math.random().toString(36).slice(2, 10);
  next();
};

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Wrap async handlers so rejected promises reach the error handler. */
export function asyncHandler(fn: RequestHandler): RequestHandler {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/**
 * Central error handler. Never leaks stack traces or provider errors to
 * clients — logs server-side with the request id, returns {error:{code,message}}.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: { code: "invalid_request", message: "Invalid request body." } });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof ConfigError) {
    res.status(503).json({ error: { code: err.code, message: err.message } });
    return;
  }

  // Unknown error: log the detail server-side, return an opaque message.
  console.error(
    JSON.stringify({ level: "error", requestId: req.requestId, message: (err as Error)?.message }),
  );
  res.status(500).json({ error: { code: "internal_error", message: "Something went wrong." } });
};
