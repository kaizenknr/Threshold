import { Router } from "express";
import type { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import {
  adaptRecipeRequest,
  adaptRecipeResponse,
  discoverRecipesRequest,
  discoverRecipesResponse,
  estimateMacrosRequest,
  estimateMacrosResponse,
  extractTargetsRequest,
  extractTargetsResponse,
  foodCheckRequest,
  foodCheckResponse,
  medSynopsisRequest,
  medSynopsisResponse,
  pantryRequest,
  pantryResponse,
} from "@kidney/shared";
import { requireAuth } from "../middleware/auth.js";
import { requireConsent } from "../middleware/consent.js";
import { rateLimitMiddleware } from "../middleware/rateLimit.js";
import { AI_LIMIT } from "../lib/rateLimit.js";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import { jsonCall, MODELS } from "../lib/anthropic.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { getEffectiveTargets } from "../lib/targets.js";
import {
  adaptRecipePrompt,
  discoverRecipesPrompt,
  estimateMacrosPrompt,
  extractTargetsPrompt,
  foodCheckPrompt,
  medSynopsisPrompt,
  pantryPrompt,
} from "../prompts/features.js";

export const aiRouter = Router();

// All AI endpoints: authed, consented, rate-limited.
aiRouter.use("/ai", requireAuth, requireConsent, rateLimitMiddleware("ai", AI_LIMIT));

/** Validate model output against the response schema; 502 if the model misbehaved. */
function validateAi<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new HttpError(502, "ai_bad_output", "The assistant returned an unexpected response.");
  }
  return parsed.data;
}

/** Structured, PHI-free cost/latency log line. */
function logUsage(requestId: string | undefined, endpoint: string, usage: { model: string; inputTokens: number; outputTokens: number; latencyMs: number }) {
  console.log(JSON.stringify({ level: "info", requestId, endpoint, ...usage }));
}

/** Read a private-storage file and return an Anthropic vision content block. */
async function storageFileBlock(
  bucket: string,
  path: string,
): Promise<Anthropic.ContentBlockParam> {
  // Defense in depth: never let a path escape a user's own folder.
  if (path.includes("..") || path.startsWith("/")) {
    throw new HttpError(400, "invalid_path", "Invalid file path.");
  }
  const { data, error } = await supabaseAdmin.storage.from(bucket).download(path);
  if (error || !data) throw new HttpError(404, "file_not_found", "Uploaded file not found.");
  const mediaType = data.type || (path.endsWith(".pdf") ? "application/pdf" : "image/jpeg");
  const base64 = Buffer.from(await data.arrayBuffer()).toString("base64");
  if (mediaType === "application/pdf") {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } };
  }
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
      data: base64,
    },
  };
  // Bytes are used transiently and never logged.
}

// POST /ai/adapt-recipe
aiRouter.post(
  "/ai/adapt-recipe",
  asyncHandler(async (req, res) => {
    const { craving } = adaptRecipeRequest.parse(req.body);
    const targets = await getEffectiveTargets(req.userId!);
    const { json, usage } = await jsonCall({
      model: MODELS.reason,
      system: adaptRecipePrompt(targets),
      content: `Craving: ${craving}`,
    });
    logUsage(req.requestId, "adapt-recipe", usage);
    res.json(validateAi(adaptRecipeResponse, json));
  }),
);

// POST /ai/estimate-macros (cheap model, high volume)
aiRouter.post(
  "/ai/estimate-macros",
  asyncHandler(async (req, res) => {
    const { description } = estimateMacrosRequest.parse(req.body);
    const { json, usage } = await jsonCall({
      model: MODELS.cheap,
      system: estimateMacrosPrompt(),
      content: `Food: ${description}`,
    });
    logUsage(req.requestId, "estimate-macros", usage);
    res.json(validateAi(estimateMacrosResponse, json));
  }),
);

// POST /ai/food-check (web search on -> must use reason model)
aiRouter.post(
  "/ai/food-check",
  asyncHandler(async (req, res) => {
    const { mode, query } = foodCheckRequest.parse(req.body);
    const targets = await getEffectiveTargets(req.userId!);
    const { json, usage } = await jsonCall({
      model: MODELS.reason,
      system: foodCheckPrompt(targets),
      content: mode === "barcode" ? `Barcode/product code: ${query}` : `Food: ${query}`,
      useWebSearch: true,
    });
    logUsage(req.requestId, "food-check", usage);
    res.json(validateAi(foodCheckResponse, json));
  }),
);

// POST /ai/discover-recipes (web search on)
aiRouter.post(
  "/ai/discover-recipes",
  asyncHandler(async (req, res) => {
    const { query } = discoverRecipesRequest.parse(req.body);
    const targets = await getEffectiveTargets(req.userId!);
    const { json, usage } = await jsonCall({
      model: MODELS.reason,
      system: discoverRecipesPrompt(targets),
      content: `Find kidney-friendly recipes for: ${query}`,
      useWebSearch: true,
    });
    logUsage(req.requestId, "discover-recipes", usage);
    res.json(validateAi(discoverRecipesResponse, json));
  }),
);

// POST /ai/pantry (vision)
aiRouter.post(
  "/ai/pantry",
  asyncHandler(async (req, res) => {
    const { imagePath } = pantryRequest.parse(req.body);
    // Confine strictly to the caller's own pantry folder — no other user, no
    // other bucket prefix, no traversal.
    if (!imagePath.startsWith(`${req.userId}/pantry/`) || imagePath.includes("..")) {
      throw new HttpError(403, "forbidden", "Not your file.");
    }
    const targets = await getEffectiveTargets(req.userId!);
    const block = await storageFileBlock("pantry", imagePath);
    const { json, usage } = await jsonCall({
      model: MODELS.reason,
      system: pantryPrompt(targets),
      content: [block, { type: "text", text: "Identify the foods and suggest kidney-friendlier meal ideas." }],
    });
    logUsage(req.requestId, "pantry", usage);
    res.json(validateAi(pantryResponse, json));
  }),
);

// POST /ai/extract-targets (vision) — marks resulting overrides verified:false
aiRouter.post(
  "/ai/extract-targets",
  asyncHandler(async (req, res) => {
    const { documentId } = extractTargetsRequest.parse(req.body);
    const { data: doc } = await supabaseAdmin
      .from("doctor_documents")
      .select("id,storage_path")
      .eq("id", documentId)
      .eq("user_id", req.userId!)
      .maybeSingle();
    if (!doc) throw new HttpError(404, "document_not_found", "Document not found.");

    const block = await storageFileBlock("doctor-docs", doc.storage_path);
    const { json, usage } = await jsonCall({
      model: MODELS.reason,
      system: extractTargetsPrompt(),
      content: [block, { type: "text", text: "Extract the dietary targets written on this sheet." }],
    });
    logUsage(req.requestId, "extract-targets", usage);
    const extracted = validateAi(extractTargetsResponse, json);

    // Store what the LLM read for user review, and stage overrides as UNVERIFIED
    // (user confirms in the app before they take effect as "Doctor's number").
    await supabaseAdmin
      .from("doctor_documents")
      .update({ extracted })
      .eq("id", documentId)
      .eq("user_id", req.userId!);

    const staged = (["sodium", "protein", "potassium", "phosphorus", "fluid"] as const)
      .filter((k) => extracted[k])
      .map((k) => ({
        user_id: req.userId!,
        condition_id: "ckd",
        metric_key: k,
        value: extracted[k] as string,
        is_custom: false,
        source: "doc_upload",
        verified: false,
      }));
    if (staged.length) await supabaseAdmin.from("target_overrides").insert(staged);

    res.json(extracted);
  }),
);

// POST /ai/med-synopsis — neutral summary of the user's OWN logs
aiRouter.post(
  "/ai/med-synopsis",
  asyncHandler(async (req, res) => {
    const { medicationId } = medSynopsisRequest.parse(req.body);
    const { data: med } = await supabaseAdmin
      .from("medications")
      .select("id,name")
      .eq("id", medicationId)
      .eq("user_id", req.userId!)
      .maybeSingle();
    if (!med) throw new HttpError(404, "medication_not_found", "Medication not found.");

    const { data: logs } = await supabaseAdmin
      .from("medication_logs")
      .select("taken_at,effectiveness,side_effects")
      .eq("user_id", req.userId!)
      .eq("medication_id", medicationId)
      .order("taken_at", { ascending: false })
      .limit(100);

    const logText = (logs ?? [])
      .map(
        (l) =>
          `- ${l.taken_at}: effectiveness ${l.effectiveness ?? "n/a"}/5${l.side_effects ? `, side effects: ${l.side_effects}` : ""}`,
      )
      .join("\n") || "(no logs recorded yet)";

    const { json, usage } = await jsonCall({
      model: MODELS.reason,
      system: medSynopsisPrompt(med.name),
      content: `The user's logs for "${med.name}":\n${logText}`,
    });
    logUsage(req.requestId, "med-synopsis", usage);
    res.json(validateAi(medSynopsisResponse, json));
  }),
);
