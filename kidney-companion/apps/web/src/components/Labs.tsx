"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { LineChart, type ChartPoint } from "./LineChart";
import { btn, card, errText, h3, hint, input } from "./ui";

type LabRow = { id: string; test_key: string; label: string | null; value: number; unit: string | null; taken_on: string; note: string | null };

// Common CKD-relevant tests as quick-picks (with usual units).
const COMMON: { key: string; label: string; unit: string }[] = [
  { key: "egfr", label: "eGFR", unit: "mL/min/1.73m²" },
  { key: "creatinine", label: "Creatinine", unit: "mg/dL" },
  { key: "bun", label: "BUN", unit: "mg/dL" },
  { key: "potassium", label: "Potassium", unit: "mmol/L" },
  { key: "phosphorus", label: "Phosphorus", unit: "mg/dL" },
  { key: "hemoglobin", label: "Hemoglobin", unit: "g/dL" },
  { key: "albumin", label: "Albumin", unit: "g/dL" },
  { key: "pth", label: "PTH", unit: "pg/mL" },
  { key: "uacr", label: "Urine ACR", unit: "mg/g" },
  { key: "a1c", label: "A1c", unit: "%" },
];

export function Labs({ userId }: { userId: string }) {
  const [rows, setRows] = useState<LabRow[]>([]);
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("");
  const [takenOn, setTakenOn] = useState(new Date().toISOString().slice(0, 10));
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from("lab_results").select("id,test_key,label,value,unit,taken_on,note").order("taken_on", { ascending: true }).limit(1000);
    setRows((data ?? []) as LabRow[]);
  }
  useEffect(() => { load(); }, []);

  function pick(c: (typeof COMMON)[number]) { setLabel(c.label); setUnit(c.unit); }

  async function add() {
    setErr(null);
    const v = Number(value);
    if (!label.trim() || Number.isNaN(v)) return setErr("Enter a test name and a numeric value.");
    const { error } = await supabase.from("lab_results").insert({
      user_id: userId, test_key: label.trim().toLowerCase(), label: label.trim(), value: v, unit: unit.trim() || null, taken_on: takenOn,
    });
    if (error) setErr(error.message);
    else { setValue(""); await load(); }
  }
  async function remove(id: string) { await supabase.from("lab_results").delete().eq("id", id); await load(); }

  const grouped = useMemo(() => {
    const m = new Map<string, LabRow[]>();
    for (const r of rows) { const list = m.get(r.test_key) ?? []; list.push(r); m.set(r.test_key, list); }
    return [...m.entries()];
  }, [rows]);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={card}>
        <h3 style={h3}>Add a test result</h3>
        <p style={hint}>Record labs over time so you and your doctor can see progression vs. regression at a glance.</p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
          {COMMON.map((c) => <button key={c.key} onClick={() => pick(c)} style={{ border: "1px solid #cbd5e1", background: "#f8fafc", borderRadius: 999, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>{c.label}</button>)}
        </div>
        <input style={input} placeholder="test name" value={label} onChange={(e) => setLabel(e.target.value)} />
        <div style={{ display: "flex", gap: 8 }}>
          <input style={{ ...input, flex: 1 }} placeholder="value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
          <input style={{ ...input, flex: 1 }} placeholder="unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
        </div>
        <input style={input} type="date" value={takenOn} onChange={(e) => setTakenOn(e.target.value)} />
        <button style={btn} onClick={add}>Add result</button>
        {err && <p style={errText}>{err}</p>}
      </div>

      {grouped.length === 0 && <div style={card}><p style={hint}>No results yet — add your first above.</p></div>}
      {grouped.map(([key, list]) => {
        const sorted = [...list].sort((a, b) => a.taken_on.localeCompare(b.taken_on));
        const latest = sorted[sorted.length - 1]!;
        const prev = sorted.length > 1 ? sorted[sorted.length - 2]! : null;
        const delta = prev ? latest.value - prev.value : null;
        const points: ChartPoint[] = sorted.map((r) => ({ t: new Date(r.taken_on).getTime(), y: Number(r.value) }));
        return (
          <div key={key} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <h3 style={h3}>{latest.label ?? key}</h3>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{latest.value}{latest.unit ? ` ${latest.unit}` : ""}</div>
                {delta !== null && (
                  <div style={{ fontSize: 12, color: delta === 0 ? "#64748b" : "#334155" }}>
                    {delta > 0 ? "▲" : delta < 0 ? "▼" : "→"} {Math.abs(delta).toLocaleString()} since last
                  </div>
                )}
              </div>
            </div>
            <LineChart points={points} unit={latest.unit} />
            <div style={{ marginTop: 6 }}>
              {sorted.slice().reverse().slice(0, 5).map((r) => (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0", color: "#475569" }}>
                  <span>{new Date(r.taken_on).toLocaleDateString()}</span>
                  <span>{r.value}{r.unit ? ` ${r.unit}` : ""} <span style={{ color: "#b91c1c", cursor: "pointer", marginLeft: 8 }} onClick={() => remove(r.id)}>✕</span></span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
