"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { btn, btnGhost, card, chip, chipOn, errText, hint, input, sectionTitle } from "./ui";

type ConditionRow = { id: string; name: string };

/**
 * First-run onboarding: pick any of the built-in conditions (or add your own),
 * then we create a health_profiles row per condition. This is what makes the
 * app multi-condition and profile-driven instead of assuming CKD.
 */
export function Onboarding({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [conditions, setConditions] = useState<ConditionRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [custom, setCustom] = useState("");
  const [customs, setCustoms] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("conditions").select("id,name").eq("active", true).order("name").then(({ data }) => {
      setConditions((data ?? []) as ConditionRow[]);
    });
  }, []);

  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const addCustom = () => {
    const name = custom.trim();
    if (name && !customs.includes(name)) setCustoms([...customs, name]);
    setCustom("");
  };

  async function finish() {
    setErr(null);
    if (selected.size === 0 && customs.length === 0) return setErr("Pick at least one condition (or add your own).");
    setSaving(true);
    try {
      const conditionIds = [...selected];
      // Include any text still sitting in the input that wasn't "Add"-ed yet.
      const pending = custom.trim();
      const allCustoms = pending && !customs.includes(pending) ? [...customs, pending] : customs;
      // Create any custom conditions the user typed (owned by them).
      for (const name of allCustoms) {
        const id = `custom_${crypto.randomUUID().slice(0, 8)}`;
        const { error } = await supabase.from("conditions").insert({ id, name, created_by: userId, active: true });
        if (error) throw error;
        conditionIds.push(id);
      }
      // One health profile per condition (idempotent).
      const rows = conditionIds.map((condition_id) => ({ user_id: userId, condition_id }));
      const { error } = await supabase.from("health_profiles").upsert(rows, { onConflict: "user_id,condition_id", ignoreDuplicates: true });
      if (error) throw error;
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ ...card, marginTop: 20 }}>
      <h1 style={sectionTitle}>Welcome 👋</h1>
      <p style={hint}>
        This is your space to manage everything about your condition(s) in one place — targets, symptom tracking, flare-ups,
        questions for your doctor, and appointments. To set it up, <strong>which conditions are you managing?</strong> Pick as many as apply.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "14px 0" }}>
        {conditions.map((c) => (
          <button key={c.id} onClick={() => toggle(c.id)} style={{ ...chip, ...(selected.has(c.id) ? chipOn : {}), padding: "9px 14px", fontSize: 14 }}>
            {selected.has(c.id) ? "✓ " : ""}{c.name}
          </button>
        ))}
      </div>

      <p style={{ ...hint, marginTop: 10 }}>Not listed? Add your own:</p>
      <div style={{ display: "flex", gap: 8 }}>
        <input style={{ ...input, flex: 1 }} placeholder="e.g. Fibromyalgia" value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCustom()} />
        <button style={btnGhost} onClick={addCustom}>Add</button>
      </div>
      {customs.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {customs.map((n) => (
            <span key={n} style={{ ...chip, ...chipOn }}>
              {n}
              <span style={{ marginLeft: 6, cursor: "pointer" }} onClick={() => setCustoms(customs.filter((x) => x !== n))}>✕</span>
            </span>
          ))}
        </div>
      )}

      {err && <p style={errText}>{err}</p>}
      <button style={{ ...btn, marginTop: 18, width: "100%", padding: "12px" }} onClick={finish} disabled={saving}>
        {saving ? "Setting up…" : "Continue"}
      </button>
      <p style={{ ...hint, textAlign: "center", marginTop: 8 }}>You can add or remove conditions anytime from your Profile.</p>
    </div>
  );
}
