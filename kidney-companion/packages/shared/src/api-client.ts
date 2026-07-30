import type { z } from "zod";
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
  signUploadRequest,
  signUploadResponse,
  targetsResponse,
} from "./schemas";

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export interface ApiClientOptions {
  baseUrl: string; // e.g. https://api.kidneycompanion.com/v1
  /** Returns the current Supabase session JWT, or null if signed out. */
  getToken: () => Promise<string | null> | string | null;
  fetch?: typeof fetch;
}

/**
 * Typed client for the Server API. Validates responses against the shared Zod
 * schemas so the web and mobile apps get end-to-end type safety and never
 * silently consume a malformed payload.
 */
export function createApiClient(opts: ApiClientOptions) {
  const doFetch = opts.fetch ?? fetch;

  async function request<Req extends z.ZodTypeAny, Res extends z.ZodTypeAny>(
    method: "GET" | "POST",
    path: string,
    reqSchema: Req | null,
    resSchema: Res,
    body?: z.input<Req extends z.ZodTypeAny ? Req : never>,
    query?: Record<string, string>,
  ): Promise<z.infer<Res>> {
    const token = await opts.getToken();
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (token) headers["authorization"] = `Bearer ${token}`;

    const url = new URL(opts.baseUrl.replace(/\/$/, "") + path);
    if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

    const validatedBody =
      reqSchema && body !== undefined ? JSON.stringify(reqSchema.parse(body)) : undefined;

    const res = await doFetch(url.toString(), {
      method,
      headers,
      body: validatedBody,
    });

    const json = (await res.json().catch(() => ({}))) as unknown;
    if (!res.ok) {
      const err = json as { error?: { code?: string; message?: string } };
      throw new ApiClientError(
        res.status,
        err.error?.code ?? "unknown_error",
        err.error?.message ?? `Request failed (${res.status})`,
      );
    }
    return resSchema.parse(json);
  }

  return {
    getTargets: (condition = "ckd") =>
      request("GET", "/targets", null, targetsResponse, undefined, { condition }),

    adaptRecipe: (body: z.input<typeof adaptRecipeRequest>) =>
      request("POST", "/ai/adapt-recipe", adaptRecipeRequest, adaptRecipeResponse, body),

    foodCheck: (body: z.input<typeof foodCheckRequest>) =>
      request("POST", "/ai/food-check", foodCheckRequest, foodCheckResponse, body),

    discoverRecipes: (body: z.input<typeof discoverRecipesRequest>) =>
      request("POST", "/ai/discover-recipes", discoverRecipesRequest, discoverRecipesResponse, body),

    pantry: (body: z.input<typeof pantryRequest>) =>
      request("POST", "/ai/pantry", pantryRequest, pantryResponse, body),

    estimateMacros: (body: z.input<typeof estimateMacrosRequest>) =>
      request("POST", "/ai/estimate-macros", estimateMacrosRequest, estimateMacrosResponse, body),

    extractTargets: (body: z.input<typeof extractTargetsRequest>) =>
      request("POST", "/ai/extract-targets", extractTargetsRequest, extractTargetsResponse, body),

    medSynopsis: (body: z.input<typeof medSynopsisRequest>) =>
      request("POST", "/ai/med-synopsis", medSynopsisRequest, medSynopsisResponse, body),

    signUpload: (body: z.input<typeof signUploadRequest>) =>
      request("POST", "/uploads/sign", signUploadRequest, signUploadResponse, body),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
