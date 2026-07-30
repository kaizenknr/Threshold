/**
 * Canonical CKD condition + guideline seed (BUILD SPEC §12).
 *
 * These are GENERAL starting ranges, not personalized medical advice. Each
 * carries its source citation. The server `/targets` engine reads the
 * authoritative copy from the `guidelines` table (seeded by the SQL migration
 * to match these values); this TypeScript copy lets clients render ranges and
 * keeps the engine's rule shapes typed. Doctor overrides always win.
 */

export interface ConditionMetricDef {
  id: string; // 'ckd.sodium'
  key: string; // 'sodium'
  label: string;
  unit: string;
  conditional: boolean; // "only if advised"
  sort: number;
}

/** A guideline rule as stored in `guidelines.rule` (jsonb). */
export type GuidelineRule =
  | { kind: "range"; range: string; note?: string }
  | {
      kind: "protein_band";
      stage: "early" | "nondialysis" | "dialysis";
      diabetes?: boolean;
      g_per_kg: [number, number];
      note?: string;
    };

export interface GuidelineSeed {
  metric_id: string;
  rule: GuidelineRule;
  source: string;
  source_url: string | null;
  version: string;
}

export const CKD_CONDITION = { id: "ckd", name: "Chronic Kidney Disease", active: true };

export const CKD_METRICS: ConditionMetricDef[] = [
  { id: "ckd.sodium", key: "sodium", label: "Sodium", unit: "mg/day", conditional: false, sort: 10 },
  { id: "ckd.protein", key: "protein", label: "Protein", unit: "g/kg/day", conditional: false, sort: 20 },
  { id: "ckd.potassium", key: "potassium", label: "Potassium", unit: "mg/day", conditional: true, sort: 30 },
  { id: "ckd.phosphorus", key: "phosphorus", label: "Phosphorus", unit: "mg/day", conditional: true, sort: 40 },
  { id: "ckd.fluid", key: "fluid", label: "Fluid", unit: "varies", conditional: true, sort: 50 },
];

const KDOQI = "KDOQI 2020";
const NKF = "National Kidney Foundation";

export const CKD_GUIDELINES: GuidelineSeed[] = [
  // Sodium — applies broadly.
  {
    metric_id: "ckd.sodium",
    rule: { kind: "range", range: "under 2,300 mg/day", note: "many aim under 2,000 mg/day" },
    source: KDOQI,
    source_url: null,
    version: "kdoqi-2020",
  },
  // Protein — by profile. g/kg × weight_kg when weight is known.
  {
    metric_id: "ckd.protein",
    rule: { kind: "protein_band", stage: "early", g_per_kg: [0.8, 0.8] },
    source: KDOQI,
    source_url: null,
    version: "kdoqi-2020",
  },
  {
    metric_id: "ckd.protein",
    rule: { kind: "protein_band", stage: "nondialysis", diabetes: false, g_per_kg: [0.55, 0.6], note: "metabolically stable, no diabetes" },
    source: KDOQI,
    source_url: null,
    version: "kdoqi-2020",
  },
  {
    metric_id: "ckd.protein",
    rule: { kind: "protein_band", stage: "nondialysis", diabetes: true, g_per_kg: [0.6, 0.8] },
    source: KDOQI,
    source_url: null,
    version: "kdoqi-2020",
  },
  {
    metric_id: "ckd.protein",
    rule: { kind: "protein_band", stage: "dialysis", g_per_kg: [1.0, 1.2], note: "MORE protein on dialysis — never restrict below this" },
    source: KDOQI,
    source_url: null,
    version: "kdoqi-2020",
  },
  // Potassium — individualized; only if advised.
  {
    metric_id: "ckd.potassium",
    rule: { kind: "range", range: "individualized; often 2,000–3,000 mg/day when limited" },
    source: `${KDOQI} / ${NKF}`,
    source_url: null,
    version: "kdoqi-2020",
  },
  // Phosphorus — if limited.
  {
    metric_id: "ckd.phosphorus",
    rule: { kind: "range", range: "800–1,000 mg/day if limited (usually when blood phosphorus is high)" },
    source: KDOQI,
    source_url: null,
    version: "kdoqi-2020",
  },
  // Fluid — set by care team.
  {
    metric_id: "ckd.fluid",
    rule: { kind: "range", range: "set by your care team; often only limited in later stages/dialysis" },
    source: NKF,
    source_url: null,
    version: "nkf",
  },
];

export const LB_PER_KG = 2.2046;
export const lbToKg = (lb: number): number => lb / LB_PER_KG;
export const kgToLb = (kg: number): number => kg * LB_PER_KG;
