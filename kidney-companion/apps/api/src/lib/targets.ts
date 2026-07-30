import {
  computeTargets,
  type ConditionMetricDef,
  type EffectiveTarget,
  type GuidelineRow,
  type OverrideInput,
  type ProfileInput,
} from "@kidney/shared";
import { supabaseAdmin } from "./supabaseAdmin.js";

/** Load profile + guidelines + overrides and compute effective targets for a user. */
export async function getEffectiveTargets(
  userId: string,
  condition = "ckd",
): Promise<EffectiveTarget[]> {
  const [metricsRes, guidelinesRes, profileRes, overridesRes] = await Promise.all([
    supabaseAdmin
      .from("condition_metrics")
      .select("id,key,label,unit,conditional,sort")
      .eq("condition_id", condition),
    supabaseAdmin.from("guidelines").select("metric_id,rule,source,version"),
    supabaseAdmin
      .from("health_profiles")
      .select("stage,diabetes,weight_kg")
      .eq("user_id", userId)
      .eq("condition_id", condition)
      .maybeSingle(),
    supabaseAdmin
      .from("target_overrides")
      .select("metric_key,value,is_custom,source,verified")
      .eq("user_id", userId)
      .eq("condition_id", condition),
  ]);

  const metrics = (metricsRes.data ?? []) as ConditionMetricDef[];
  const metricIds = new Set(metrics.map((m) => m.id));
  const guidelines = ((guidelinesRes.data ?? []) as GuidelineRow[]).filter((g) =>
    metricIds.has(g.metric_id),
  );

  const profile: ProfileInput = profileRes.data
    ? {
        stage: profileRes.data.stage as ProfileInput["stage"],
        diabetes: !!profileRes.data.diabetes,
        weight_kg: profileRes.data.weight_kg ?? null,
      }
    : { stage: "nondialysis", diabetes: false, weight_kg: null };

  const overrides = (overridesRes.data ?? []) as OverrideInput[];

  return computeTargets({ condition, metrics, guidelines, profile, overrides });
}
