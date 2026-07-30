import type { EffectiveTarget } from "@kidney/shared";

/**
 * Per-feature system prompts (BUILD SPEC §10). Each instructs strict-JSON
 * output matching the shared response schema, and receives the user's
 * EFFECTIVE targets (guideline + doctor overrides) so advice respects the
 * care team's numbers. Guardrails (§10.4) are prepended separately in jsonCall.
 */

export function targetsContext(targets: EffectiveTarget[]): string {
  if (!targets.length) return "The user has no saved targets yet; use general CKD ranges.";
  const lines = targets.map((t) => {
    const ov = t.override ? ` [Doctor's number: ${t.override.value}]` : "";
    return `- ${t.label} (${t.unit || "n/a"}): ${t.range}${ov}${t.conditional ? " (only if advised)" : ""}`;
  });
  return `The user's current targets (doctor's numbers override general ranges):\n${lines.join("\n")}`;
}

export const adaptRecipePrompt = (targets: EffectiveTarget[]) => `Create a kidney-friendlier version of a dish the user is craving.
${targetsContext(targets)}
Return ONLY JSON:
{"dishName":string,"encouragement":string,"ingredients":string[],"steps":string[],"swaps":string[],"watch":string[]}
- "swaps": lower-sodium/potassium/phosphorus substitutions and why.
- "watch": ingredients to keep an eye on given CKD, phrased as general information.
- Do not promise health outcomes; note that fit depends on the person's stage and labs.`;

export const foodCheckPrompt = (targets: EffectiveTarget[]) => `Assess a food (or a scanned barcode's product) for someone managing CKD.
${targetsContext(targets)}
Use web search to check typical nutrient values when helpful; cite reasoning briefly.
Return ONLY JSON:
{"food":string,"rating":"generally friendly"|"use caution"|"usually limited","reasons":string[],"nutrients":{"sodium":string|null,"potassium":string|null,"phosphorus":string|null},"alternatives":string[],"caveat":string}
- NEVER output a binary safe/unsafe verdict — only the three ratings above.
- "caveat" must remind the user their stage and labs determine what fits, and their care team decides.`;

export const discoverRecipesPrompt = (targets: EffectiveTarget[]) => `Find real, fact-checked kidney-friendly recipes from the web.
${targetsContext(targets)}
Use web search. Prefer reputable sources (e.g. National Kidney Foundation, DaVita, registered dietitians).
Return ONLY JSON:
{"recipes":[{"title":string,"source":string,"url":string,"whyKidneyFriendly":string,"flags":string[]}]}
- "flags": nutrients to watch in this recipe (e.g. "higher potassium from tomato").
- Only include recipes you actually found; never invent URLs.`;

export const pantryPrompt = (targets: EffectiveTarget[]) => `Look at a photo of the user's pantry/fridge and suggest kidney-friendlier meal ideas.
${targetsContext(targets)}
Return ONLY JSON:
{"items":string[],"ideas":string[]}
- "items": foods you can identify in the image.
- "ideas": meal ideas using those items, noting which are gentler on sodium/potassium/phosphorus.`;

export const estimateMacrosPrompt = () => `Estimate nutrients for a described food for a CKD food log.
Return ONLY JSON:
{"label":string,"sodium_mg":number|null,"potassium_mg":number|null,"phosphorus_mg":number|null,"protein_g":number|null,"calories":number|null}
- Best-effort estimates for a typical serving; use null when genuinely unknown.
- These are estimates, not lab values.`;

export const extractTargetsPrompt = () => `Read a photo/PDF of a doctor's instruction sheet and extract dietary targets the clinician wrote.
Return ONLY JSON:
{"sodium":string|null,"protein":string|null,"potassium":string|null,"phosphorus":string|null,"fluid":string|null,"other":[{"label":string,"value":string}]}
- Copy the clinician's wording; do not convert units or infer values that are not written.
- Use null for any target not present in the document.`;

export const medSynopsisPrompt = (medName: string) => `Summarize ONLY what the user recorded about their medication "${medName}" from their own logs.
Return ONLY JSON:
{"overall":string,"helping":string,"sideEffectsPattern":string,"shareNote":string}
- Neutral summary of logged effectiveness (1–5) and side effects. Do NOT judge whether the medication is working or is safe.
- "shareNote": a short note the user could bring to their prescriber/pharmacist.
- End nothing with a verdict; always defer decisions to their prescriber/pharmacist.`;
