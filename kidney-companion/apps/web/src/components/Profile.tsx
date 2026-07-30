"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { btn, btnGhost, card, chip, chipOn, errText, h3, hint, input, li, ul } from "./ui";

type Cond = { id: string; name: string };
type OverrideRow = { id: string; condition_id: string | null; metric_key: string; value: string; verified: boolean };
type InstructionRow = { id: string; condition_id: string | null; instruction: string };

export function Profile({
  userId,
  email,
  myConditions,
  onChange,
}: {
  userId: string;
  email: string | undefined;
  myConditions: Cond[];
  onChange: () => void;
}) {
  const [all, setAll] = useState<Cond[]>([]);
  const [custom, setCustom] = useState("");
  const [err, setErr] = useState<string | null>(null);

  // CKD detail state
  const hasCkd = myConditions.some((c) => c.id === "ckd");
  const [stage, setStage] = useState("nondialysis");
  const [diabetes, setDiabetes] = useState(false);
  const [weightKg, setWeightKg] = useState("");

  // overrides
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [ovCond, setOvCond] = useState("");
  const [ovKey, setOvKey] = useState("");
  const [ovVal, setOvVal] = useState("");

  // written instructions
  const [instructions, setInstructions] = useState<InstructionRow[]>([]);
  const [instrText, setInstrText] = useState("");
  const [instrCond, setInstrCond] = useState("");

  async function loadAll() {
    const { data } = await supabase.from("conditions").select("id,name").eq("active", true).order("name");
    setAll((data ?? []) as Cond[]);
  }
  async function loadCkd() {
    if (!hasCkd) return;
    const { data } = await supabase.from("health_profiles").select("stage,diabetes,weight_kg").eq("user_id", userId).eq("condition_id", "ckd").maybeSingle();
    if (data) {
      setStage(data.stage ?? "nondialysis");
      setDiabetes(!!data.diabetes);
      setWeightKg(data.weight_kg != null ? String(data.weight_kg) : "");
    }
  }
  async function loadOverrides() {
    const { data } = await supabase.from("target_overrides").select("id,condition_id,metric_key,value,verified").order("created_at", { ascending: false });
    setOverrides((data ?? []) as OverrideRow[]);
  }
  async function loadInstructions() {
    const { data } = await supabase.from("care_instructions").select("id,condition_id,instruction").order("created_at", { ascending: false });
    setInstructions((data ?? []) as InstructionRow[]);
  }
  useEffect(() => { loadAll(); loadCkd(); loadOverrides(); loadInstructions(); }, [myConditions.length]);

  async function addInstruction() {
    setErr(null);
    if (!instrText.trim()) return;
    const { error } = await supabase.from("care_instructions").insert({
      user_id: userId, instruction: instrText.trim(), condition_id: instrCond || null,
    });
    if (error) setErr(error.message);
    else { setInstrText(""); await loadInstructions(); }
  }
  async function removeInstruction(id: string) {
    await supabase.from("care_instructions").delete().eq("id", id);
    await loadInstructions();
  }

  const available = all.filter((c) => !myConditions.some((m) => m.id === c.id));

  async function addCondition(id: string) {
    await supabase.from("health_profiles").upsert({ user_id: userId, condition_id: id }, { onConflict: "user_id,condition_id", ignoreDuplicates: true });
    onChange();
  }
  async function addCustom() {
    const name = custom.trim();
    if (!name) return;
    const id = `custom_${crypto.randomUUID().slice(0, 8)}`;
    const { error } = await supabase.from("conditions").insert({ id, name, created_by: userId, active: true });
    if (error) return setErr(error.message);
    await addCondition(id);
    setCustom("");
  }
  async function removeCondition(id: string) {
    await supabase.from("health_profiles").delete().eq("user_id", userId).eq("condition_id", id);
    onChange();
  }
  async function saveCkd() {
    setErr(null);
    const { error } = await supabase.from("health_profiles").upsert(
      { user_id: userId, condition_id: "ckd", stage, diabetes, weight_kg: weightKg ? Number(weightKg) : null },
      { onConflict: "user_id,condition_id" },
    );
    if (error) setErr(error.message);
  }
  async function addOverride() {
    setErr(null);
    if (!ovCond || !ovKey.trim() || !ovVal.trim()) return setErr("Pick a condition and enter a metric + value.");
    const { error } = await supabase.from("target_overrides").insert({
      user_id: userId, condition_id: ovCond, metric_key: ovKey.trim().toLowerCase(), value: ovVal.trim(), source: "doctor", verified: true,
    });
    if (error) setErr(error.message);
    else { setOvKey(""); setOvVal(""); await loadOverrides(); }
  }
  async function removeOverride(id: string) {
    await supabase.from("target_overrides").delete().eq("id", id);
    await loadOverrides();
  }

  const nameById = new Map(all.map((c) => [c.id, c.name]));

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* Account */}
      <div style={card}>
        <h3 style={h3}>Account</h3>
        <p style={hint}>Signed in as {email ?? "you"}.</p>
        <button style={btnGhost} onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>

      {/* Conditions */}
      <div style={card}>
        <h3 style={h3}>My conditions</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {myConditions.map((c) => (
            <span key={c.id} style={{ ...chip, ...chipOn }}>
              {c.name}<span style={{ marginLeft: 8, cursor: "pointer" }} onClick={() => removeCondition(c.id)}>✕</span>
            </span>
          ))}
          {myConditions.length === 0 && <p style={hint}>None yet.</p>}
        </div>
        {available.length > 0 && (
          <>
            <p style={hint}>Add a condition:</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {available.map((c) => <button key={c.id} style={chip} onClick={() => addCondition(c.id)}>+ {c.name}</button>)}
            </div>
          </>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input style={{ ...input, flex: 1 }} placeholder="add your own…" value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCustom()} />
          <button style={btnGhost} onClick={addCustom}>Add</button>
        </div>
      </div>

      {/* CKD details */}
      {hasCkd && (
        <div style={card}>
          <h3 style={h3}>Kidney (CKD) details</h3>
          <p style={hint}>These tailor your protein target. Your care team’s numbers always win.</p>
          <label style={hint}>Stage</label>
          <select style={input} value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="early">Early (stage 1–2)</option>
            <option value="nondialysis">Stage 3–5, not on dialysis</option>
            <option value="dialysis">On dialysis</option>
          </select>
          <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "8px 0" }}>
            <input type="checkbox" checked={diabetes} onChange={(e) => setDiabetes(e.target.checked)} /> I also have diabetes
          </label>
          <label style={hint}>Weight (kg) — optional, for gram targets</label>
          <input style={input} inputMode="decimal" placeholder="kg" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
          <button style={btn} onClick={saveCkd}>Save details</button>
        </div>
      )}

      {/* Doctor's written instructions */}
      <div style={card}>
        <h3 style={h3}>Doctor’s instructions</h3>
        <p style={hint}>Anything your care team told you to do — reminders, do’s and don’ts, things to watch. Kept in your own words.</p>
        <select style={input} value={instrCond} onChange={(e) => setInstrCond(e.target.value)}>
          <option value="">General (any condition)</option>
          {myConditions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div style={{ display: "flex", gap: 8 }}>
          <input style={{ ...input, flex: 1 }} placeholder="e.g. Weigh yourself daily; call if up 2+ kg" value={instrText} onChange={(e) => setInstrText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addInstruction()} />
          <button style={btn} onClick={addInstruction}>Add</button>
        </div>
        <ul style={ul}>
          {instructions.map((i) => (
            <li key={i.id} style={li}>
              {i.condition_id && <span style={{ color: "#64748b", fontSize: 12 }}>[{nameById.get(i.condition_id) ?? i.condition_id}] </span>}
              {i.instruction}
              <span style={{ marginLeft: 8, color: "#b91c1c", cursor: "pointer" }} onClick={() => removeInstruction(i.id)}>remove</span>
            </li>
          ))}
          {instructions.length === 0 && <li style={{ ...li, color: "#94a3b8" }}>No instructions saved yet.</li>}
        </ul>
      </div>

      {/* Doctor's specific target numbers (overrides) */}
      <div style={card}>
        <h3 style={h3}>Specific target numbers</h3>
        <p style={hint}>Exact numbers your care team gave you (e.g. “sodium under 1500 mg/day”). These replace the general guideline on your Targets screen.</p>
        <select style={input} value={ovCond} onChange={(e) => setOvCond(e.target.value)}>
          <option value="">Choose a condition…</option>
          {myConditions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div style={{ display: "flex", gap: 8 }}>
          <input style={{ ...input, flex: 1 }} placeholder="metric (e.g. sodium, protein)" value={ovKey} onChange={(e) => setOvKey(e.target.value)} />
          <input style={{ ...input, flex: 1 }} placeholder="value (e.g. 1500 mg/day)" value={ovVal} onChange={(e) => setOvVal(e.target.value)} />
        </div>
        <button style={btn} onClick={addOverride}>Save doctor’s number</button>
        {err && <p style={errText}>{err}</p>}
        <ul style={ul}>
          {overrides.map((o) => (
            <li key={o.id} style={li}>
              <strong>{nameById.get(o.condition_id ?? "") ?? o.condition_id}</strong> · {o.metric_key}: {o.value}
              <span style={{ marginLeft: 8, color: "#b91c1c", cursor: "pointer" }} onClick={() => removeOverride(o.id)}>remove</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
