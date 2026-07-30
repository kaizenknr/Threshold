import { randomUUID } from "node:crypto";
import { Router } from "express";
import { signUploadRequest, signUploadResponse } from "@kidney/shared";
import { requireAuth } from "../middleware/auth.js";
import { rateLimitMiddleware } from "../middleware/rateLimit.js";
import { UPLOAD_LIMIT } from "../lib/rateLimit.js";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";

export const uploadsRouter = Router();

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

const BUCKET = { doctor_doc: "doctor-docs", pantry: "pantry" } as const;

// POST /uploads/sign — signed URL to upload to a private bucket, per-user path.
uploadsRouter.post(
  "/uploads/sign",
  requireAuth,
  rateLimitMiddleware("upload", UPLOAD_LIMIT),
  asyncHandler(async (req, res) => {
    const { kind, contentType } = signUploadRequest.parse(req.body);
    const bucket = BUCKET[kind];
    // Per-user path prefix so storage RLS confines each user to their folder.
    const path = `${req.userId}/${kind}/${randomUUID()}.${EXT[contentType]}`;

    const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUploadUrl(path);
    if (error || !data) throw new HttpError(500, "upload_sign_failed", "Could not create upload URL.");

    // Record the doctor document row up front so we can reference it by id later.
    if (kind === "doctor_doc") {
      await supabaseAdmin.from("doctor_documents").insert({ user_id: req.userId, storage_path: path });
    }

    res.json(signUploadResponse.parse({ uploadUrl: data.signedUrl, path }));
  }),
);
