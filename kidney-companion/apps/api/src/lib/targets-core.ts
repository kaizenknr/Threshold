import type { ConditionMetricDef, EffectiveTarget, GuidelineRule } from "@kidney/shared";

/* -------------------------------------------------------------------------
 * Pure targets engine — NO I/O, no server imports (BUILD SPEC §12).
 * Kept free of DB/env dependencies so it is fully unit-testable and reusable.
 * ---------------------------------------------------------------------- */

export interface GuidelineRow {
  metric_id: string;
  rule: GuidelineRule;
  source: string;
  version: string;
}

export interface ProfileInput {
  stage: "early" | "nondialysis" | "dialysis";
  diabetes: boolean;
  weight_kg: number | null;
}

export interface OverrideInput {
  metric_key: string;
  value: string;
  is_custom: boolean;
  source: string;
  verified: boolean;
}

export interface ComputeInput {
  condition: string;
  metrics: ConditionMetricDef[];
  guidelines: GuidelineRow[];
  profile: ProfileInput;
  overrides: OverrideInput[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function selectProteinBand(
  rules: Extract<GuidelineRule, { kind: "protein_band" }>[],
  profile: ProfileInput,
): Extract<GuidelineRule, { kind: "protein_band" }> | undefined {
  return rules.find((r) => {
    if (r.stage !== profile.stage) return false;
    if (r.diabetes === undefined) return true;
    return r.diabetes === profile.diabetes;
  });
}

function proteinRangeText(
  band: Extract<GuidelineRule, { kind: "protein_band" }>,
  weightKg: number | null,
): string {
  const [lo, hi] = band.g_per_kg;
  const base = lo === hi ? `${lo} g/kg/day` : `${lo}–${hi} g/kg/day`;
  const note = band.note ? ` (${band.note})` : "";
  if (weightKg && weightKg > 0) {
    const gLo = Math.round(lo * weightKg);
    const gHi = Math.round(hi * weightKg);
    const grams = gLo === gHi ? `~${gLo} g/day` : `~${gLo}–${gHi} g/day`;
    return `${base} — about ${grams} at ${round1(weightKg)} kg${note}`;
  }
  return `${base}${note}`;
}

/** Compute effective targets: guideline defaults with doctor overrides layered on. */
export function computeTargets(input: ComputeInput): EffectiveTarget[] {
  const overrideByKey = new Map(input.overrides.map((o) => [o.metric_key, o]));
  const guidelinesByMetric = new Map<string, GuidelineRow[]>();
  for (const g of input.guidelines) {
    const list = guidelinesByMetric.get(g.metric_id) ?? [];
    list.push(g);
    guidelinesByMetric.set(g.metric_id, list);
  }

  const known = input.metrics
    .slice()
    .sort((a, b) => a.sort - b.sort)
    .map<EffectiveTarget>((metric) => {
      const rows = guidelinesByMetric.get(metric.id) ?? [];
      let range = "—";
      const source = rows[0]?.source ?? "";

      if (metric.key === "protein") {
        const bands = rows
          .map((r) => r.rule)
          .filter((r): r is Extract<GuidelineRule, { kind: "protein_band" }> => r.kind === "protein_band");
        const band = selectProteinBand(bands, input.profile);
        if (band) range = proteinRangeText(band, input.profile.weight_kg);
      } else {
        const rule = rows[0]?.rule;
        if (rule && rule.kind === "range") {
          range = rule.note ? `${rule.range} (${rule.note})` : rule.range;
        }
      }

      const target: EffectiveTarget = {
        key: metric.key,
        label: metric.label,
        unit: metric.unit,
        range,
        source,
        conditional: metric.conditional,
      };

      const ov = overrideByKey.get(metric.key);
      if (ov) target.override = { value: ov.value, source: ov.source, verified: ov.verified };
      return target;
    });

  const customTargets = input.overrides
    .filter((o) => o.is_custom)
    .map<EffectiveTarget>((o) => ({
      key: o.metric_key,
      label: o.metric_key,
      unit: "",
      range: "—",
      source: "",
      conditional: false,
      override: { value: o.value, source: o.source, verified: o.verified },
    }));

  return [...known, ...customTargets];
}
