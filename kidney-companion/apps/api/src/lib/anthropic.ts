import "../server-only.js";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env.js";
import { GUARDRAILS } from "../prompts/guardrails.js";
import { safeParseJson } from "./json.js";

// The ONLY place ANTHROPIC_API_KEY is read.
const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

/**
 * Model IDs verified against the current Anthropic model catalog
 * (claude-api skill, cached 2026-06-24). Route by cost/capability.
 *  - reason: adapt, discover, med-synopsis, extract, pantry, and BOTH
 *            web-search endpoints (see note below).
 *  - cheap:  estimate-macros, simple non-web food-check.
 */
export const MODELS = {
  reason: "claude-sonnet-5",
  cheap: "claude-haiku-4-5",
} as const;

/**
 * Web search is a server-side tool. The current version is `web_search_20260209`
 * (dynamic filtering). NOTE: that version requires Sonnet 5 / Opus 4.6+ — it is
 * NOT supported on Haiku 4.5 — so every web-search call must use MODELS.reason.
 */
export const WEB_SEARCH_TOOL = {
  type: "web_search_20260209",
  name: "web_search",
  max_uses: 5,
} as const;

export interface JsonCallOpts {
  model: string;
  system: string;
  /** string or multimodal content blocks (vision). */
  content: string | Anthropic.MessageParam["content"];
  useWebSearch?: boolean;
  maxTokens?: number;
  /** For cost tracking / structured logs (no PHI). */
  requestId?: string;
}

export interface JsonCallResult<T = unknown> {
  json: T;
  usage: { model: string; inputTokens: number; outputTokens: number; latencyMs: number };
}

function isRetryable(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  return status === 429 || (typeof status === "number" && status >= 500);
}

/**
 * Single entry point for structured LLM calls. Prepends §10.4 guardrails,
 * enforces strict-JSON output, retries once on 429/5xx, and returns parsed
 * JSON plus usage for cost tracking. Thinking is disabled for deterministic,
 * cheap, JSON-shaped output on non-web calls; web-search calls keep adaptive
 * thinking on (better tool use on Sonnet 5) with more headroom.
 */
export async function jsonCall<T = unknown>(opts: JsonCallOpts): Promise<JsonCallResult<T>> {
  const started = Date.now();
  const maxTokens = opts.maxTokens ?? (opts.useWebSearch ? 2500 : 1500);

  const build = (): Anthropic.MessageCreateParamsNonStreaming => ({
    model: opts.model,
    max_tokens: maxTokens,
    system: `${GUARDRAILS}\n\n${opts.system}`,
    // Non-web calls: disable thinking for predictable JSON and lower cost.
    // Web calls: leave adaptive thinking on (Sonnet 5 is less tool-eager with
    // thinking off) so web_search actually fires.
    ...(opts.useWebSearch ? {} : { thinking: { type: "disabled" } }),
    messages: [
      {
        role: "user",
        content:
          typeof opts.content === "string"
            ? [{ type: "text", text: opts.content }]
            : opts.content,
      },
    ],
    ...(opts.useWebSearch ? { tools: [WEB_SEARCH_TOOL as unknown as Anthropic.ToolUnion] } : {}),
  });

  let msg: Anthropic.Message;
  try {
    msg = await client.messages.create(build());
  } catch (err) {
    if (!isRetryable(err)) {
      if ((err as { status?: number })?.status === 400) {
        const m = (err as Error).message ?? "";
        if (/web.?search/i.test(m)) {
          throw new ConfigError(
            "Web search tool is not enabled for this org. Enable it in the Claude Console.",
          );
        }
      }
      throw err;
    }
    await new Promise((r) => setTimeout(r, 750));
    msg = await client.messages.create(build());
  }

  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const json = safeParseJson(text) as T;
  return {
    json,
    usage: {
      model: opts.model,
      inputTokens: msg.usage.input_tokens,
      outputTokens: msg.usage.output_tokens,
      latencyMs: Date.now() - started,
    },
  };
}

/** Thrown when the org is missing a required capability (e.g. web search). */
export class ConfigError extends Error {
  code = "provider_not_configured";
}
