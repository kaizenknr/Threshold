import { z } from "zod";

/* -------------------------------------------------------------------------
 * Condition framework
 * ---------------------------------------------------------------------- */

export const conditionIdSchema = z.string().min(1); // 'ckd', future conditions
export const ckdStageSchema = z.enum(["early", "nondialysis", "dialysis"]);
export type CkdStage = z.infer<typeof ckdStageSchema>;

/** Canonical CKD metric keys used across DB, engine, and clients. */
export const metricKeySchema = z.enum([
  "sodium",
  "protein",
  "potassium",
  "phosphorus",
  "fluid",
]);
export type MetricKey = z.infer<typeof metricKeySchema>;

/* -------------------------------------------------------------------------
 * User data (mirrors DB tables; RLS enforces ownership server-side)
 * ---------------------------------------------------------------------- */

export const healthProfileSchema = z.object({
  condition_id: conditionIdSchema.default("ckd"),
  stage: ckdStageSchema.default("nondialysis"),
  diabetes: z.boolean().default(false),
  /** Canonical weight in kilograms. Convert lb -> kg (÷ 2.2046) at the edge. */
  weight_kg: z.number().positive().max(500).nullable().optional(),
});
export type HealthProfile = z.infer<typeof healthProfileSchema>;

export const targetOverrideSchema = z.object({
  condition_id: conditionIdSchema.default("ckd"),
  /** A known metric key, or a custom free-text label when is_custom = true. */
  metric_key: z.string().min(1),
  /** As written by/for the doctor, e.g. "1500 mg/day" or "1.0 g/kg". */
  value: z.string().min(1),
  is_custom: z.boolean().default(false),
  source: z.enum(["doctor", "doc_upload"]).default("doctor"),
  /** false until the user confirms a value read from an uploaded document. */
  verified: z.boolean().default(false),
});
export type TargetOverride = z.infer<typeof targetOverrideSchema>;

export const recipeSchema = z.object({
  title: z.string().min(1).max(200),
  kind: z.enum(["adapted", "web", "custom"]),
  data: z.record(z.unknown()),
});
export type Recipe = z.infer<typeof recipeSchema>;

export const foodLogSchema = z.object({
  logged_on: z.string().date().optional(), // YYYY-MM-DD; defaults to today server-side
  label: z.string().min(1).max(200),
  sodium_mg: z.number().nonnegative().nullable().optional(),
  potassium_mg: z.number().nonnegative().nullable().optional(),
  phosphorus_mg: z.number().nonnegative().nullable().optional(),
  protein_g: z.number().nonnegative().nullable().optional(),
  calories: z.number().nonnegative().nullable().optional(),
  estimated: z.boolean().default(true),
});
export type FoodLog = z.infer<typeof foodLogSchema>;

export const medicationSchema = z.object({
  name: z.string().min(1).max(200),
  dose: z.string().max(200).nullable().optional(),
});
export type Medication = z.infer<typeof medicationSchema>;

export const medicationLogSchema = z.object({
  medication_id: z.string().uuid(),
  taken_at: z.string().datetime(),
  effectiveness: z.number().int().min(1).max(5).nullable().optional(),
  side_effects: z.string().max(2000).nullable().optional(),
});
export type MedicationLog = z.infer<typeof medicationLogSchema>;

export const consentSchema = z.object({
  terms_version: z.string().min(1),
});
export type Consent = z.infer<typeof consentSchema>;

/* -------------------------------------------------------------------------
 * Tracking module (graphable readings, episodes, questions, appointments).
 * Client-side CRUD via the Supabase SDK; RLS enforces ownership.
 * ---------------------------------------------------------------------- */

export const metricReadingSchema = z.object({
  condition_id: conditionIdSchema.nullable().optional(),
  metric_key: z.string().min(1).max(60),
  label: z.string().max(120).nullable().optional(),
  value: z.number(),
  unit: z.string().max(30).nullable().optional(),
  recorded_at: z.string().datetime().optional(),
  note: z.string().max(1000).nullable().optional(),
});
export type MetricReading = z.infer<typeof metricReadingSchema>;

export const episodeSchema = z.object({
  condition_id: conditionIdSchema.nullable().optional(),
  title: z.string().min(1).max(200),
  severity: z.number().int().min(1).max(10).nullable().optional(),
  started_at: z.string().datetime().optional(),
  ended_at: z.string().datetime().nullable().optional(),
  symptoms: z.string().max(2000).nullable().optional(),
  triggers: z.string().max(2000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type Episode = z.infer<typeof episodeSchema>;

export const appointmentSchema = z.object({
  title: z.string().min(1).max(200),
  provider: z.string().max(200).nullable().optional(),
  location: z.string().max(300).nullable().optional(),
  scheduled_at: z.string().datetime(),
  reminder_at: z.string().datetime().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  status: z.enum(["scheduled", "completed", "cancelled"]).default("scheduled"),
});
export type Appointment = z.infer<typeof appointmentSchema>;

export const doctorQuestionSchema = z.object({
  condition_id: conditionIdSchema.nullable().optional(),
  appointment_id: z.string().uuid().nullable().optional(),
  question: z.string().min(1).max(1000),
  answered: z.boolean().default(false),
  answer: z.string().max(2000).nullable().optional(),
});
export type DoctorQuestion = z.infer<typeof doctorQuestionSchema>;

/* -------------------------------------------------------------------------
 * Server API — request/response contracts (see BUILD SPEC §7)
 * Every AI response is strict JSON; never a prose verdict.
 * ---------------------------------------------------------------------- */

// POST /ai/adapt-recipe
export const adaptRecipeRequest = z.object({ craving: z.string().min(1).max(500) });
export const adaptRecipeResponse = z.object({
  dishName: z.string(),
  encouragement: z.string(),
  ingredients: z.array(z.string()),
  steps: z.array(z.string()),
  swaps: z.array(z.string()),
  watch: z.array(z.string()),
});

// POST /ai/food-check
export const foodCheckRequest = z.object({
  mode: z.enum(["food", "barcode"]),
  query: z.string().min(1).max(300),
});
export const foodRatingSchema = z.enum([
  "generally friendly",
  "use caution",
  "usually limited",
]);
export const foodCheckResponse = z.object({
  food: z.string(),
  rating: foodRatingSchema,
  reasons: z.array(z.string()),
  nutrients: z.object({
    sodium: z.string().nullable(),
    potassium: z.string().nullable(),
    phosphorus: z.string().nullable(),
  }),
  alternatives: z.array(z.string()),
  caveat: z.string(),
});

// POST /ai/discover-recipes
export const discoverRecipesRequest = z.object({ query: z.string().min(1).max(300) });
export const discoverRecipesResponse = z.object({
  recipes: z.array(
    z.object({
      title: z.string(),
      source: z.string(),
      url: z.string(),
      whyKidneyFriendly: z.string(),
      flags: z.array(z.string()),
    }),
  ),
});

// POST /ai/pantry
export const pantryRequest = z.object({ imagePath: z.string().min(1) });
export const pantryResponse = z.object({
  items: z.array(z.string()),
  ideas: z.array(z.string()),
});

// POST /ai/estimate-macros
export const estimateMacrosRequest = z.object({ description: z.string().min(1).max(500) });
export const estimateMacrosResponse = z.object({
  label: z.string(),
  sodium_mg: z.number().nullable(),
  potassium_mg: z.number().nullable(),
  phosphorus_mg: z.number().nullable(),
  protein_g: z.number().nullable(),
  calories: z.number().nullable(),
});

// POST /ai/extract-targets
export const extractTargetsRequest = z.object({ documentId: z.string().uuid() });
export const extractTargetsResponse = z.object({
  sodium: z.string().nullable(),
  protein: z.string().nullable(),
  potassium: z.string().nullable(),
  phosphorus: z.string().nullable(),
  fluid: z.string().nullable(),
  other: z.array(z.object({ label: z.string(), value: z.string() })),
});

// POST /ai/med-synopsis
export const medSynopsisRequest = z.object({ medicationId: z.string().uuid() });
export const medSynopsisResponse = z.object({
  overall: z.string(),
  helping: z.string(),
  sideEffectsPattern: z.string(),
  shareNote: z.string(),
});

// POST /uploads/sign
export const signUploadRequest = z.object({
  kind: z.enum(["doctor_doc", "pantry"]),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]),
});
export const signUploadResponse = z.object({
  uploadUrl: z.string(),
  path: z.string(),
});

// GET /targets
export const effectiveTargetSchema = z.object({
  key: z.string(),
  label: z.string(),
  unit: z.string(),
  /** Human-readable guideline range, computed by the server engine. */
  range: z.string(),
  source: z.string(),
  conditional: z.boolean(),
  /** Present when a doctor override supersedes the guideline default. */
  override: z
    .object({ value: z.string(), source: z.string(), verified: z.boolean() })
    .optional(),
});
export const targetsResponse = z.object({
  condition: conditionIdSchema,
  metrics: z.array(effectiveTargetSchema),
});
export type EffectiveTarget = z.infer<typeof effectiveTargetSchema>;
export type TargetsResponse = z.infer<typeof targetsResponse>;

// Standard error envelope
export const apiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
