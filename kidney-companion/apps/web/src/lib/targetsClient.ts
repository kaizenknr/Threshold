import {
  computeTargets,
  type ConditionMetricDef,
  type EffectiveTarget,
  type GuidelineRow,
  type OverrideInput,
  type ProfileInput,
} from "@kidney/shared";
import { supabase } from "./supabaseClient";

/**
 * Compute a condition's effective targets entirely client-side, reading the
 * same RLS-protected tables the server API would. Guidelines/metrics are
 * readable by any authenticated user; profile + overrides are the user's own.
 * Returns null when the condition has no guideline metrics (e.g. custom ones).
 */
export async function computeConditionTargets(
  userId: string,
  conditionId: string,
): Promise<EffectiveTarget[] | null> {
  const [metricsRes, guidelinesRes, profileRes, overridesRes] = await Promise.all([
    supabase.from("condition_metrics").select("id,key,label,unit,conditional,sort").eq("condition_id", conditionId),
    supabase.from("guidelines").select("metric_id,rule,source,version"),
    supabase.from("health_profiles").select("stage,diabetes,weight_kg").eq("user_id", userId).eq("condition_id", conditionId).maybeSingle(),
    supabase.from("target_overrides").select("metric_key,value,is_custom,source,verified").eq("user_id", userId).eq("condition_id", conditionId),
  ]);

  const metrics = (metricsRes.data ?? []) as ConditionMetricDef[];
  if (metrics.length === 0) return null;

  const metricIds = new Set(metrics.map((m) => m.id));
  const guidelines = ((guidelinesRes.data ?? []) as GuidelineRow[]).filter((g) => metricIds.has(g.metric_id));
  const p = profileRes.data;
  const profile: ProfileInput = p
    ? { stage: (p.stage as ProfileInput["stage"]) ?? "nondialysis", diabetes: !!p.diabetes, weight_kg: p.weight_kg ?? null }
    : { stage: "nondialysis", diabetes: false, weight_kg: null };
  const overrides = (overridesRes.data ?? []) as OverrideInput[];

  return computeTargets({ condition: conditionId, metrics, guidelines, profile, overrides });
}
