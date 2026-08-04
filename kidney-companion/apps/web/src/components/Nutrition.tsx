"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { btn, btnGhost, card, chip, chipOn, errText, h3, hint, input, li, toIso, ul } from "./ui";

type FoodRow = { id: string; label: string; sodium_mg: number | null; potassium_mg: number | null; phosphorus_mg: number | null; protein_g: number | null; calories: number | null; logged_on: string };
type FoodRef = { id: string; name: string; category: string; potassium_level: string | null; phosphorus_level: string | null; sodium_level: string | null; high_protein: boolean; note: string | null; swap_for: string | null };

const todayStr = () => new Date().toISOString().slice(0, 10);
const parseNum = (s: string | null | undefined): number | null => {
  if (!s) return null;
  const m = s.replace(/,/g, "").match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};
const proteinBand = (stage: string, diabetes: boolean): [number, number] =>
  stage === "early" ? [0.8, 0.8] : stage === "dialysis" ? [1.0, 1.2] : diabetes ? [0.6, 0.8] : [0.55, 0.6];

function Bar({ value, max, kind }: { value: number; max: number; kind: "limit" | "goal" }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const over = value > max;
  const color = kind === "limit" ? (over ? "#c9404a" : pct > 80 ? "#d4a847" : "#2563eb") : value >= max * 0.9 ? "#2f9e44" : "#d4a847";
  return (
    <div style={{ background: "#eef2f7", borderRadius: 6, height: 8, overflow: "hidden", margin: "4px 0" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color }} />
    </div>
  );
}

export function Nutrition({ userId }: { userId: string }) {
  const [foods, setFoods] = useState<FoodRow[]>([]);
  const [refs, setRefs] = useState<FoodRef[]>([]);
  const [ckd, setCkd] = useState<{ stage: string; diabetes: boolean; weight_kg: number | null } | null>(null);
  const [ovr, setOvr] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<string>("all");

  // add-food form
  const [label, setLabel] = useState("");
  const [na, setNa] = useState(""); const [k, setK] = useState(""); const [p, setP] = useState(""); const [pro, setPro] = useState(""); const [cal, setCal] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function loadFoods() {
    const { data } = await supabase.from("food_log").select("id,label,sodium_mg,potassium_mg,phosphorus_mg,protein_g,calories,logged_on").eq("logged_on", todayStr()).order("created_at", { ascending: false });
    setFoods((data ?? []) as FoodRow[]);
  }
  useEffect(() => {
    loadFoods();
    supabase.from("kidney_friendly_foods").select("*").order("sort").then(({ data }) => setRefs((data ?? []) as FoodRef[]));
    supabase.from("health_profiles").select("stage,diabetes,weight_kg").eq("user_id", userId).eq("condition_id", "ckd").maybeSingle().then(({ data }) => setCkd(data as never));
    supabase.from("target_overrides").select("metric_key,value").eq("condition_id", "ckd").then(({ data }) => {
      const map: Record<string, string> = {};
      for (const r of (data ?? []) as { metric_key: string; value: string }[]) map[r.metric_key] = r.value;
      setOvr(map);
    });
  }, [userId]);

  const totals = useMemo(() => foods.reduce(
    (a, f) => ({
      sodium: a.sodium + (f.sodium_mg ?? 0), potassium: a.potassium + (f.potassium_mg ?? 0), phosphorus: a.phosphorus + (f.phosphorus_mg ?? 0),
      protein: a.protein + (f.protein_g ?? 0), calories: a.calories + (f.calories ?? 0),
    }),
    { sodium: 0, potassium: 0, phosphorus: 0, protein: 0, calories: 0 },
  ), [foods]);

  const sodiumLimit = parseNum(ovr["sodium"]) ?? 2300;
  const potassiumLimit = parseNum(ovr["potassium"]) ?? 3000;
  const phosphorusLimit = parseNum(ovr["phosphorus"]) ?? 1000;
  const proteinGoal = (() => {
    if (!ckd) return null;
    const band = proteinBand(ckd.stage, ckd.diabetes);
    if (ckd.weight_kg) return { lo: Math.round(band[0] * ckd.weight_kg), hi: Math.round(band[1] * ckd.weight_kg) };
    return null;
  })();

  async function addFood(prefillLabel?: string) {
    setErr(null);
    const lbl = (prefillLabel ?? label).trim();
    if (!lbl) return setErr("Enter a food.");
    const { error } = await supabase.from("food_log").insert({
      user_id: userId, label: lbl, logged_on: todayStr(), estimated: true,
      sodium_mg: parseNum(na), potassium_mg: parseNum(k), phosphorus_mg: parseNum(p), protein_g: parseNum(pro), calories: parseNum(cal),
    });
    if (error) setErr(error.message);
    else { setLabel(""); setNa(""); setK(""); setP(""); setPro(""); setCal(""); await loadFoods(); }
  }
  async function removeFood(id: string) { await supabase.from("food_log").delete().eq("id", id); await loadFoods(); }

  const cats = ["all", "protein", "fruit", "vegetable", "grain", "drink", "swap"];
  const shownRefs = filter === "all" ? refs : refs.filter((r) => r.category === filter);
  const levelColor = (lvl: string | null) => (lvl === "high" ? "#c9404a" : lvl === "moderate" ? "#d4a847" : "#2f9e44");

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* Today's totals */}
      <div style={card}>
        <h3 style={h3}>Today’s nutrition</h3>
        {!ckd && <p style={hint}>Add kidney (CKD) details in your Profile to see targets. You can still log food and totals below.</p>}
        <NutrRow label="Protein" value={totals.protein} unit="g" kind="goal" target={proteinGoal ? proteinGoal.hi : undefined}
          caption={proteinGoal ? `aim ${proteinGoal.lo}–${proteinGoal.hi} g — keep protein up` : "keep protein up (set weight in Profile for a goal)"} />
        <NutrRow label="Sodium" value={totals.sodium} unit="mg" kind="limit" target={sodiumLimit} caption={`stay under ${sodiumLimit.toLocaleString()} mg`} />
        <NutrRow label="Potassium" value={totals.potassium} unit="mg" kind="limit" target={potassiumLimit} caption="limit if advised" />
        <NutrRow label="Phosphorus" value={totals.phosphorus} unit="mg" kind="limit" target={phosphorusLimit} caption="limit if advised" />
        <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}><strong>Calories</strong><span>{Math.round(totals.calories)}</span></div>
          <p style={hint}>The tricky part: most low-calorie foods aren’t kidney-friendly. Track calories for weight, but keep protein up and within your limits — discuss a calorie goal with your dietitian.</p>
        </div>
      </div>

      {/* Log a food */}
      <div style={card}>
        <h3 style={h3}>Log a food</h3>
        <p style={hint}>Enter values from the label/your dietitian where you can — leave blank if unknown. Totals use whatever you enter.</p>
        <input style={input} placeholder="food (e.g. grilled chicken, 3 oz)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <input style={{ ...input, flex: "1 1 90px" }} placeholder="protein g" inputMode="decimal" value={pro} onChange={(e) => setPro(e.target.value)} />
          <input style={{ ...input, flex: "1 1 90px" }} placeholder="sodium mg" inputMode="decimal" value={na} onChange={(e) => setNa(e.target.value)} />
          <input style={{ ...input, flex: "1 1 90px" }} placeholder="potassium mg" inputMode="decimal" value={k} onChange={(e) => setK(e.target.value)} />
          <input style={{ ...input, flex: "1 1 90px" }} placeholder="phosphorus mg" inputMode="decimal" value={p} onChange={(e) => setP(e.target.value)} />
          <input style={{ ...input, flex: "1 1 90px" }} placeholder="calories" inputMode="decimal" value={cal} onChange={(e) => setCal(e.target.value)} />
        </div>
        <button style={btn} onClick={() => addFood()}>Add food</button>
        {err && <p style={errText}>{err}</p>}
        <ul style={ul}>
          {foods.map((f) => (
            <li key={f.id} style={li}>
              <strong>{f.label}</strong>
              <span style={{ marginLeft: 8, color: "#b91c1c", cursor: "pointer", fontSize: 12 }} onClick={() => removeFood(f.id)}>remove</span>
              <br /><small style={hint}>{[f.protein_g && `${f.protein_g}g protein`, f.sodium_mg && `${f.sodium_mg}mg Na`, f.potassium_mg && `${f.potassium_mg}mg K`, f.phosphorus_mg && `${f.phosphorus_mg}mg P`, f.calories && `${f.calories} cal`].filter(Boolean).join(" · ") || "no values entered"}</small>
            </li>
          ))}
          {foods.length === 0 && <li style={{ ...li, color: "#94a3b8" }}>Nothing logged today yet.</li>}
        </ul>
      </div>

      {/* Kidney-friendly guide + swaps */}
      <div style={card}>
        <h3 style={h3}>Kidney-friendly foods &amp; swaps</h3>
        <p style={hint}>General guidance (levels, not exact numbers) — your dietitian tailors this to your labs.</p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0" }}>
          {cats.map((c) => <button key={c} style={{ ...chip, ...(filter === c ? chipOn : {}) }} onClick={() => setFilter(c)}>{c}</button>)}
        </div>
        {shownRefs.map((r) => (
          <div key={r.id} style={{ padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <strong>{r.name}{r.high_protein ? " 💪" : ""}</strong>
              <button style={{ ...btnGhost, fontSize: 12, padding: "4px 9px" }} onClick={() => addFood(r.name)}>+ log</button>
            </div>
            <div style={{ fontSize: 12, margin: "3px 0" }}>
              <span style={{ color: levelColor(r.potassium_level) }}>K {r.potassium_level}</span>{" · "}
              <span style={{ color: levelColor(r.phosphorus_level) }}>P {r.phosphorus_level}</span>{" · "}
              <span style={{ color: levelColor(r.sodium_level) }}>Na {r.sodium_level}</span>
            </div>
            {r.note && <div style={hint}>{r.note}</div>}
            {r.swap_for && <div style={{ ...hint, color: "#1e40af" }}>↳ try instead: {r.swap_for}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function NutrRow({ label, value, unit, target, kind, caption }: { label: string; value: number; unit: string; target?: number; kind: "limit" | "goal"; caption: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
        <strong>{label}</strong>
        <span>{Math.round(value).toLocaleString()}{target ? ` / ${target.toLocaleString()}` : ""} {unit}</span>
      </div>
      {target ? <Bar value={value} max={target} kind={kind} /> : null}
      <small style={hint}>{caption}</small>
    </div>
  );
}
