import { describe, expect, it } from "vitest";
import { CKD_GUIDELINES, CKD_METRICS } from "@kidney/shared";
import { computeTargets, type GuidelineRow, type ProfileInput } from "./targets-core.js";

// Reuse the shared seed as the engine's guideline input (mirrors the DB seed).
const guidelines: GuidelineRow[] = CKD_GUIDELINES.map((g) => ({
  metric_id: g.metric_id,
  rule: g.rule,
  source: g.source,
  version: g.version,
}));

function run(profile: ProfileInput, overrides: Parameters<typeof computeTargets>[0]["overrides"] = []) {
  return computeTargets({ condition: "ckd", metrics: CKD_METRICS, guidelines, profile, overrides });
}

const byKey = (rows: ReturnType<typeof run>, key: string) => rows.find((r) => r.key === key)!;

describe("computeTargets — CKD", () => {
  it("keeps metrics in sort order and returns all five", () => {
    const rows = run({ stage: "nondialysis", diabetes: false, weight_kg: null });
    expect(rows.map((r) => r.key)).toEqual([
      "sodium",
      "protein",
      "potassium",
      "phosphorus",
      "fluid",
    ]);
  });

  it("sodium is non-conditional and applies broadly", () => {
    const sodium = byKey(run({ stage: "early", diabetes: false, weight_kg: null }), "sodium");
    expect(sodium.conditional).toBe(false);
    expect(sodium.range).toMatch(/2,300/);
    expect(sodium.source).toBe("KDOQI 2020");
  });

  it("protein: nondialysis without diabetes uses 0.55–0.60 g/kg", () => {
    const p = byKey(run({ stage: "nondialysis", diabetes: false, weight_kg: null }), "protein");
    expect(p.range).toMatch(/0\.55–0\.6 g\/kg\/day/);
  });

  it("protein: nondialysis WITH diabetes uses 0.6–0.8 g/kg", () => {
    const p = byKey(run({ stage: "nondialysis", diabetes: true, weight_kg: null }), "protein");
    expect(p.range).toMatch(/0\.6–0\.8 g\/kg\/day/);
  });

  it("protein: dialysis is HIGHER (1.0–1.2 g/kg) and never restricted below", () => {
    const p = byKey(run({ stage: "dialysis", diabetes: false, weight_kg: null }), "protein");
    expect(p.range).toMatch(/1–1\.2 g\/kg\/day/);
    expect(p.range).toMatch(/never restrict below/i);
  });

  it("protein: computes grams/day when weight is known", () => {
    const p = byKey(run({ stage: "dialysis", diabetes: false, weight_kg: 70 }), "protein");
    // 1.0*70=70 .. 1.2*70=84
    expect(p.range).toMatch(/~70–84 g\/day/);
    expect(p.range).toMatch(/at 70 kg/);
  });

  it("potassium, phosphorus, fluid are conditional (only if advised)", () => {
    const rows = run({ stage: "nondialysis", diabetes: false, weight_kg: null });
    expect(byKey(rows, "potassium").conditional).toBe(true);
    expect(byKey(rows, "phosphorus").conditional).toBe(true);
    expect(byKey(rows, "fluid").conditional).toBe(true);
  });

  it("doctor override supersedes but keeps the guideline range as secondary", () => {
    const rows = run(
      { stage: "nondialysis", diabetes: false, weight_kg: null },
      [{ metric_key: "sodium", value: "1500 mg/day", is_custom: false, source: "doctor", verified: true }],
    );
    const sodium = byKey(rows, "sodium");
    expect(sodium.override).toEqual({ value: "1500 mg/day", source: "doctor", verified: true });
    expect(sodium.range).toMatch(/2,300/); // guideline still present as secondary
  });

  it("custom override with a non-standard label appears as its own target", () => {
    const rows = run(
      { stage: "nondialysis", diabetes: false, weight_kg: null },
      [{ metric_key: "Calcium", value: "under 2000 mg/day", is_custom: true, source: "doctor", verified: false }],
    );
    const calcium = rows.find((r) => r.key === "Calcium");
    expect(calcium?.override?.value).toBe("under 2000 mg/day");
  });
});
