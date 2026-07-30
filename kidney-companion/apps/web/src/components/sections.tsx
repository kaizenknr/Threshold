"use client";

import { useEffect, useMemo, useState } from "react";
import type { PregnancyConsideration } from "@kidney/shared";
import { supabase } from "@/lib/supabaseClient";
import { LineChart, type ChartPoint } from "./LineChart";
import { btn, btnGhost, card, catBadge, chip, chipOn, disclaimer, errText, h3, hint, input, li, sectionTitle, toIso, nowLocal, ul } from "./ui";

/* row shapes */
type ReadingRow = { id: string; metric_key: string; label: string | null; value: number; unit: string | null; recorded_at: string; note: string | null };
type EpisodeRow = { id: string; title: string; severity: number | null; started_at: string; ended_at: string | null; symptoms: string | null; triggers: string | null; notes: string | null };
type QuestionRow = { id: string; question: string; answered: boolean; answer: string | null; created_at: string };
type ApptRow = { id: string; title: string; provider: string | null; location: string | null; scheduled_at: string; notes: string | null; status: string };
type ConditionRow = { id: string; name: string };

/* ============================ Track & graph ============================ */
export function TrackSection({ userId }: { userId: string }) {
  const [rows, setRows] = useState<ReadingRow[]>([]);
  const [metricKey, setMetricKey] = useState("");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("");
  const [when, setWhen] = useState(nowLocal());
  const [selected, setSelected] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from("metric_readings")
      .select("id,metric_key,label,value,unit,recorded_at,note")
      .order("recorded_at", { ascending: true })
      .limit(1000);
    setRows((data ?? []) as ReadingRow[]);
  }
  useEffect(() => { load(); }, []);

  const metricKeys = useMemo(() => Array.from(new Set(rows.map((r) => r.metric_key))), [rows]);
  const active = selected || metricKeys[0] || "";
  const points: ChartPoint[] = rows.filter((r) => r.metric_key === active).map((r) => ({ t: new Date(r.recorded_at).getTime(), y: Number(r.value) }));
  const activeUnit = rows.find((r) => r.metric_key === active)?.unit ?? null;

  async function add() {
    setErr(null);
    const v = Number(value);
    if (!metricKey.trim() || Number.isNaN(v)) return setErr("Enter a metric name and a numeric value.");
    const { error } = await supabase.from("metric_readings").insert({
      user_id: userId, metric_key: metricKey.trim().toLowerCase(), value: v, unit: unit.trim() || null, recorded_at: toIso(when),
    });
    if (error) setErr(error.message);
    else { setValue(""); await load(); }
  }

  return (
    <div style={card}>
      <h3 style={h3}>Log a reading</h3>
      <p style={hint}>Track anything numeric over time — glucose, heart rate, blood pressure, weight, or symptom severity (1–10).</p>
      <input style={input} placeholder="what (e.g. glucose, heart rate, symptom severity)" value={metricKey} onChange={(e) => setMetricKey(e.target.value)} />
      <div style={{ display: "flex", gap: 8 }}>
        <input style={{ ...input, flex: 1 }} placeholder="value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
        <input style={{ ...input, flex: 1 }} placeholder="unit (mg/dL, bpm…)" value={unit} onChange={(e) => setUnit(e.target.value)} />
      </div>
      <input style={input} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
      <button style={btn} onClick={add}>Add reading</button>
      {err && <p style={errText}>{err}</p>}

      {metricKeys.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <h3 style={h3}>Graph</h3>
          <select style={input} value={active} onChange={(e) => setSelected(e.target.value)}>
            {metricKeys.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <LineChart points={points} unit={activeUnit} />
          <p style={hint}>{points.length} reading{points.length === 1 ? "" : "s"} of “{active}”.</p>
        </div>
      )}
    </div>
  );
}

/* ============================ Flare-ups ============================ */
export function EpisodesSection({ userId }: { userId: string }) {
  const [rows, setRows] = useState<EpisodeRow[]>([]);
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState("5");
  const [started, setStarted] = useState(nowLocal());
  const [symptoms, setSymptoms] = useState("");
  const [triggers, setTriggers] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from("episodes").select("id,title,severity,started_at,ended_at,symptoms,triggers,notes").order("started_at", { ascending: false }).limit(200);
    setRows((data ?? []) as EpisodeRow[]);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    setErr(null);
    if (!title.trim()) return setErr("Give the episode a short title.");
    const { error } = await supabase.from("episodes").insert({
      user_id: userId, title: title.trim(), severity: severity ? Number(severity) : null, started_at: toIso(started), symptoms: symptoms.trim() || null, triggers: triggers.trim() || null,
    });
    if (error) setErr(error.message);
    else { setTitle(""); setSymptoms(""); setTriggers(""); await load(); }
  }
  async function endEpisode(id: string) {
    await supabase.from("episodes").update({ ended_at: new Date().toISOString() }).eq("id", id);
    await load();
  }

  return (
    <div style={card}>
      <h3 style={h3}>Log a flare-up</h3>
      <input style={input} placeholder="title (e.g. dizziness + racing heart)" value={title} onChange={(e) => setTitle(e.target.value)} />
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <label style={hint}>severity</label>
        <input style={{ ...input, width: 70 }} type="number" min={1} max={10} value={severity} onChange={(e) => setSeverity(e.target.value)} />
        <input style={{ ...input, flex: 1 }} type="datetime-local" value={started} onChange={(e) => setStarted(e.target.value)} />
      </div>
      <input style={input} placeholder="symptoms" value={symptoms} onChange={(e) => setSymptoms(e.target.value)} />
      <input style={input} placeholder="possible triggers" value={triggers} onChange={(e) => setTriggers(e.target.value)} />
      <button style={btn} onClick={add}>Save flare-up</button>
      {err && <p style={errText}>{err}</p>}

      <ul style={ul}>
        {rows.map((r) => (
          <li key={r.id} style={li}>
            <strong>{r.title}</strong> {r.severity ? `· severity ${r.severity}/10` : ""}
            <br /><small style={hint}>{new Date(r.started_at).toLocaleString()} {r.ended_at ? `→ ${new Date(r.ended_at).toLocaleString()}` : "· ongoing"}</small>
            {r.symptoms && <div style={hint}>Symptoms: {r.symptoms}</div>}
            {!r.ended_at && <button style={{ ...btnGhost, marginTop: 6 }} onClick={() => endEpisode(r.id)}>Mark ended</button>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ============================ Doctor questions ============================ */
export function QuestionsSection({ userId }: { userId: string }) {
  const [rows, setRows] = useState<QuestionRow[]>([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from("doctor_questions").select("id,question,answered,answer,created_at").order("created_at", { ascending: false }).limit(200);
    setRows((data ?? []) as QuestionRow[]);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    setErr(null);
    if (!q.trim()) return;
    const { error } = await supabase.from("doctor_questions").insert({ user_id: userId, question: q.trim() });
    if (error) setErr(error.message);
    else { setQ(""); await load(); }
  }
  async function toggle(id: string, answered: boolean) {
    await supabase.from("doctor_questions").update({ answered: !answered }).eq("id", id);
    await load();
  }
  async function saveAnswer(id: string, answer: string) {
    await supabase.from("doctor_questions").update({ answer, answered: true }).eq("id", id);
    await load();
  }

  return (
    <div style={card}>
      <h3 style={h3}>Questions for your doctor</h3>
      <p style={hint}>Jot things down as they come up so you don’t forget them at your visit.</p>
      <div style={{ display: "flex", gap: 8 }}>
        <input style={{ ...input, flex: 1 }} placeholder="e.g. Is my salt intake okay with my labs?" value={q} onChange={(e) => setQ(e.target.value)} />
        <button style={btn} onClick={add}>Add</button>
      </div>
      {err && <p style={errText}>{err}</p>}
      <ul style={ul}>
        {rows.map((r) => (
          <li key={r.id} style={li}>
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <input type="checkbox" checked={r.answered} onChange={() => toggle(r.id, r.answered)} />
              <span style={{ textDecoration: r.answered ? "line-through" : "none", color: r.answered ? "#94a3b8" : "inherit" }}>{r.question}</span>
            </label>
            {r.answered && (
              <input style={{ ...input, marginTop: 6 }} placeholder="answer / note from your doctor" defaultValue={r.answer ?? ""} onBlur={(e) => e.target.value !== (r.answer ?? "") && saveAnswer(r.id, e.target.value)} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ============================ Appointments ============================ */
export function AppointmentsSection({ userId }: { userId: string }) {
  const [rows, setRows] = useState<ApptRow[]>([]);
  const [title, setTitle] = useState("");
  const [provider, setProvider] = useState("");
  const [when, setWhen] = useState(nowLocal());
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from("appointments").select("id,title,provider,location,scheduled_at,notes,status").order("scheduled_at", { ascending: true }).limit(200);
    setRows((data ?? []) as ApptRow[]);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    setErr(null);
    if (!title.trim()) return setErr("Give the appointment a title.");
    const { error } = await supabase.from("appointments").insert({ user_id: userId, title: title.trim(), provider: provider.trim() || null, scheduled_at: toIso(when) });
    if (error) setErr(error.message);
    else { setTitle(""); setProvider(""); await load(); }
  }
  async function complete(id: string) {
    await supabase.from("appointments").update({ status: "completed" }).eq("id", id);
    await load();
  }

  const now = Date.now();
  const upcoming = rows.filter((r) => r.status === "scheduled" && new Date(r.scheduled_at).getTime() >= now);
  const past = rows.filter((r) => r.status !== "scheduled" || new Date(r.scheduled_at).getTime() < now);
  const countdown = (iso: string) => {
    const days = Math.ceil((new Date(iso).getTime() - now) / 86400000);
    return days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
  };

  return (
    <div style={card}>
      <h3 style={h3}>Add an appointment</h3>
      <input style={input} placeholder="title (e.g. Nephrology follow-up)" value={title} onChange={(e) => setTitle(e.target.value)} />
      <input style={input} placeholder="provider / clinic" value={provider} onChange={(e) => setProvider(e.target.value)} />
      <input style={input} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
      <button style={btn} onClick={add}>Save appointment</button>
      {err && <p style={errText}>{err}</p>}

      <h3 style={{ ...h3, marginTop: 18 }}>Upcoming</h3>
      {upcoming.length === 0 && <p style={hint}>Nothing scheduled.</p>}
      <ul style={ul}>
        {upcoming.map((r) => (
          <li key={r.id} style={li}>
            <strong>{r.title}</strong> <span style={{ color: "#2563eb", fontWeight: 600 }}>· {countdown(r.scheduled_at)}</span>
            <br /><small style={hint}>{new Date(r.scheduled_at).toLocaleString()}{r.provider ? ` · ${r.provider}` : ""}</small><br />
            <button style={{ ...btnGhost, marginTop: 6 }} onClick={() => complete(r.id)}>Mark completed</button>
          </li>
        ))}
      </ul>
      {past.length > 0 && (
        <>
          <h3 style={{ ...h3, marginTop: 10, color: "#94a3b8" }}>Past / completed</h3>
          <ul style={ul}>{past.map((r) => <li key={r.id} style={{ ...li, color: "#94a3b8" }}>{r.title} — {new Date(r.scheduled_at).toLocaleDateString()}</li>)}</ul>
        </>
      )}
      <p style={{ ...hint, marginTop: 8 }}>Reminder times are saved with each appointment; automated push/email notifications are a follow-up step.</p>
    </div>
  );
}

/* ============================ Prescriptions / meds ============================ */
type MedRow = { id: string; name: string; dose: string | null; schedule: string | null; prescriber: string | null; notes: string | null; active: boolean };

export function MedsSection({ userId }: { userId: string }) {
  const [meds, setMeds] = useState<MedRow[]>([]);
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [schedule, setSchedule] = useState("");
  const [prescriber, setPrescriber] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from("medications").select("id,name,dose,schedule,prescriber,notes,active").order("created_at", { ascending: false });
    setMeds((data ?? []) as MedRow[]);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    setErr(null);
    if (!name.trim()) return setErr("Enter the medication name.");
    const { error } = await supabase.from("medications").insert({
      user_id: userId, name: name.trim(), dose: dose.trim() || null, schedule: schedule.trim() || null, prescriber: prescriber.trim() || null,
    });
    if (error) setErr(error.message);
    else { setName(""); setDose(""); setSchedule(""); setPrescriber(""); await load(); }
  }
  async function stop(id: string) {
    await supabase.from("medications").update({ active: false }).eq("id", id);
    await load();
  }

  const active = meds.filter((m) => m.active);
  const stopped = meds.filter((m) => !m.active);

  return (
    <div style={card}>
      <h3 style={h3}>Add a prescription</h3>
      <input style={input} placeholder="medication name" value={name} onChange={(e) => setName(e.target.value)} />
      <div style={{ display: "flex", gap: 8 }}>
        <input style={{ ...input, flex: 1 }} placeholder="dose (e.g. 10 mg)" value={dose} onChange={(e) => setDose(e.target.value)} />
        <input style={{ ...input, flex: 1 }} placeholder="schedule (e.g. twice daily)" value={schedule} onChange={(e) => setSchedule(e.target.value)} />
      </div>
      <input style={input} placeholder="prescriber (optional)" value={prescriber} onChange={(e) => setPrescriber(e.target.value)} />
      <button style={btn} onClick={add}>Add prescription</button>
      {err && <p style={errText}>{err}</p>}

      <h3 style={{ ...h3, marginTop: 18 }}>Current medications</h3>
      {active.length === 0 && <p style={hint}>None yet.</p>}
      {active.map((m) => <MedCard key={m.id} med={m} userId={userId} onStop={() => stop(m.id)} />)}

      {stopped.length > 0 && (
        <>
          <h3 style={{ ...h3, marginTop: 14, color: "#94a3b8" }}>Stopped</h3>
          <ul style={ul}>{stopped.map((m) => <li key={m.id} style={{ ...li, color: "#94a3b8" }}>{m.name}{m.dose ? ` · ${m.dose}` : ""}</li>)}</ul>
        </>
      )}
      <p style={{ ...hint, marginTop: 8 }}>Logging how a med is working builds a record you can share with your prescriber. This app never judges whether a medication is working — that’s your prescriber’s call.</p>
    </div>
  );
}

function MedCard({ med, userId, onStop }: { med: MedRow; userId: string; onStop: () => void }) {
  const [last, setLast] = useState<{ taken_at: string; count: number } | null>(null);
  const [eff, setEff] = useState("");
  const [side, setSide] = useState("");
  const [open, setOpen] = useState(false);

  async function loadLast() {
    const { data, count } = await supabase
      .from("medication_logs")
      .select("taken_at", { count: "exact" })
      .eq("medication_id", med.id)
      .order("taken_at", { ascending: false })
      .limit(1);
    const rows = (data ?? []) as { taken_at: string }[];
    setLast(rows[0] ? { taken_at: rows[0].taken_at, count: count ?? 0 } : { taken_at: "", count: 0 });
  }
  useEffect(() => { loadLast(); }, []);

  async function logDose() {
    await supabase.from("medication_logs").insert({
      user_id: userId, medication_id: med.id, taken_at: new Date().toISOString(),
      effectiveness: eff ? Number(eff) : null, side_effects: side.trim() || null,
    });
    setEff(""); setSide(""); setOpen(false);
    await loadLast();
  }

  return (
    <div style={{ padding: "12px 0", borderBottom: "1px solid #f1f5f9" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <strong>{med.name}{med.dose ? ` · ${med.dose}` : ""}</strong>
        <span style={{ color: "#b91c1c", fontSize: 12, cursor: "pointer" }} onClick={onStop}>stop</span>
      </div>
      {(med.schedule || med.prescriber) && <div style={hint}>{med.schedule}{med.schedule && med.prescriber ? " · " : ""}{med.prescriber}</div>}
      <div style={hint}>
        {last && last.count > 0 ? `Logged ${last.count} time${last.count === 1 ? "" : "s"} · last ${new Date(last.taken_at).toLocaleString()}` : "No doses logged yet"}
      </div>
      {!open ? (
        <button style={{ ...btnGhost, marginTop: 6 }} onClick={() => setOpen(true)}>Log a dose</button>
      ) : (
        <div style={{ marginTop: 6 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <select style={{ ...input, width: 150 }} value={eff} onChange={(e) => setEff(e.target.value)}>
              <option value="">how well? (optional)</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}/5</option>)}
            </select>
            <input style={{ ...input, flex: 1 }} placeholder="side effects (optional)" value={side} onChange={(e) => setSide(e.target.value)} />
          </div>
          <button style={btn} onClick={logDose}>Save dose</button>
          <button style={{ ...btnGhost, marginLeft: 8 }} onClick={() => setOpen(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}

/* ============================ Pregnancy (condition-aware) ============================ */
export function PregnancySection({ myConditionIds }: { myConditionIds: string[] }) {
  const [conditions, setConditions] = useState<ConditionRow[]>([]);
  const [rows, setRows] = useState<PregnancyConsideration[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(myConditionIds));

  useEffect(() => {
    (async () => {
      const [c, p] = await Promise.all([
        supabase.from("conditions").select("id,name").eq("active", true).order("name"),
        supabase.from("pregnancy_considerations").select("id,condition_id,category,title,detail,source,sort").order("sort"),
      ]);
      setConditions((c.data ?? []) as ConditionRow[]);
      setRows((p.data ?? []) as PregnancyConsideration[]);
    })();
  }, []);

  const nameById = useMemo(() => new Map(conditions.map((c) => [c.id, c.name])), [conditions]);
  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const visible = rows.filter((r) => r.condition_id === null || selected.has(r.condition_id));
  const groups: { key: string; label: string; items: PregnancyConsideration[] }[] = [];
  const general = visible.filter((r) => r.condition_id === null);
  if (general.length) groups.push({ key: "general", label: "For any pregnancy", items: general });
  for (const c of conditions) {
    if (!selected.has(c.id)) continue;
    const items = visible.filter((r) => r.condition_id === c.id);
    if (items.length) groups.push({ key: c.id, label: nameById.get(c.id) ?? c.id, items });
  }

  return (
    <div style={card}>
      <h3 style={h3}>Pregnancy &amp; your conditions</h3>
      <div style={disclaimer}>
        General information only — <strong>not medical advice</strong>. Pregnancy with a chronic condition is higher-risk: please work with an OB
        (ideally a high-risk / maternal-fetal medicine specialist) and the doctor who manages your condition, and ask about
        <strong> preconception counseling</strong>. Never start, stop, or change a medication based on this app.
      </div>
      <p style={hint}>Conditions to include (your profile is pre-selected):</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "6px 0 12px" }}>
        {conditions.map((c) => (
          <label key={c.id} style={{ ...chip, ...(selected.has(c.id) ? chipOn : {}) }}>
            <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} style={{ marginRight: 6 }} />{c.name}
          </label>
        ))}
      </div>
      {groups.map((g) => (
        <div key={g.key} style={{ marginBottom: 16 }}>
          <h4 style={{ margin: "8px 0 4px", fontSize: "0.98rem" }}>{g.label}</h4>
          {g.items.map((r) => (
            <div key={r.id} style={{ padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
              <div><span style={catBadge}>{r.category.replace("-", " ")}</span> <strong>{r.title}</strong></div>
              <div style={{ fontSize: 14, margin: "4px 0" }}>{r.detail}</div>
              <small style={hint}>Source: {r.source}</small>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
