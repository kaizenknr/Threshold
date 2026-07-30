"use client";

import { useEffect, useMemo, useState } from "react";
import type { EffectiveTarget } from "@kidney/shared";
import { supabase } from "@/lib/supabaseClient";
import { api } from "@/lib/api";
import { LineChart, type ChartPoint } from "./LineChart";

/* ---------- row shapes returned from Supabase ---------- */
type ReadingRow = { id: string; metric_key: string; label: string | null; value: number; unit: string | null; recorded_at: string; note: string | null };
type EpisodeRow = { id: string; title: string; severity: number | null; started_at: string; ended_at: string | null; symptoms: string | null; triggers: string | null; notes: string | null };
type QuestionRow = { id: string; question: string; answered: boolean; answer: string | null; created_at: string };
type ApptRow = { id: string; title: string; provider: string | null; location: string | null; scheduled_at: string; notes: string | null; status: string };

const TABS = [
  { id: "targets", label: "Targets" },
  { id: "track", label: "Track & graph" },
  { id: "episodes", label: "Flare-ups" },
  { id: "questions", label: "Doctor Qs" },
  { id: "appts", label: "Appointments" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const toIso = (local: string) => (local ? new Date(local).toISOString() : new Date().toISOString());
const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

export function Dashboard({ userId }: { userId: string }) {
  const [tab, setTab] = useState<TabId>("targets");
  return (
    <section style={card}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{ ...tabBtn, ...(tab === t.id ? tabActive : {}) }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "targets" && <TargetsSection />}
      {tab === "track" && <TrackSection userId={userId} />}
      {tab === "episodes" && <EpisodesSection userId={userId} />}
      {tab === "questions" && <QuestionsSection userId={userId} />}
      {tab === "appts" && <AppointmentsSection userId={userId} />}
      <button style={{ ...btnGhost, marginTop: 18 }} onClick={() => supabase.auth.signOut()}>Sign out</button>
    </section>
  );
}

/* ============================ Targets ============================ */
function TargetsSection() {
  const [targets, setTargets] = useState<EffectiveTarget[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <h3 style={h3}>My targets</h3>
      <button
        style={btn}
        onClick={async () => {
          setErr(null);
          try {
            setTargets((await api.getTargets("ckd")).metrics);
          } catch (e) {
            setErr((e as Error).message);
          }
        }}
      >
        Load CKD targets
      </button>
      {targets && (
        <ul style={ul}>
          {targets.map((t) => (
            <li key={t.key} style={li}>
              <strong>{t.label}</strong> — {t.override ? `Doctor's number: ${t.override.value}` : t.range}
            </li>
          ))}
        </ul>
      )}
      {err && <p style={errText}>{err}</p>}
    </div>
  );
}

/* ============================ Track & graph ============================ */
function TrackSection({ userId }: { userId: string }) {
  const [rows, setRows] = useState<ReadingRow[]>([]);
  const [metricKey, setMetricKey] = useState("");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("");
  const [when, setWhen] = useState(nowLocal());
  const [selected, setSelected] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from("metric_readings")
      .select("id,metric_key,label,value,unit,recorded_at,note")
      .order("recorded_at", { ascending: true })
      .limit(1000);
    setRows((data ?? []) as ReadingRow[]);
  }
  useEffect(() => {
    load();
  }, []);

  const metricKeys = useMemo(() => Array.from(new Set(rows.map((r) => r.metric_key))), [rows]);
  const active = selected || metricKeys[0] || "";
  const points: ChartPoint[] = rows
    .filter((r) => r.metric_key === active)
    .map((r) => ({ t: new Date(r.recorded_at).getTime(), y: Number(r.value) }));
  const activeUnit = rows.find((r) => r.metric_key === active)?.unit ?? null;

  async function add() {
    setErr(null);
    const v = Number(value);
    if (!metricKey.trim() || Number.isNaN(v)) {
      setErr("Enter a metric name and a numeric value.");
      return;
    }
    const { error } = await supabase.from("metric_readings").insert({
      user_id: userId,
      metric_key: metricKey.trim().toLowerCase(),
      value: v,
      unit: unit.trim() || null,
      recorded_at: toIso(when),
    });
    if (error) setErr(error.message);
    else {
      setValue("");
      await load();
    }
  }

  return (
    <div>
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
            {metricKeys.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
          <LineChart points={points} unit={activeUnit} />
          <p style={hint}>{points.length} reading{points.length === 1 ? "" : "s"} of “{active}”.</p>
        </div>
      )}
    </div>
  );
}

/* ============================ Flare-ups / episodes ============================ */
function EpisodesSection({ userId }: { userId: string }) {
  const [rows, setRows] = useState<EpisodeRow[]>([]);
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState("5");
  const [started, setStarted] = useState(nowLocal());
  const [symptoms, setSymptoms] = useState("");
  const [triggers, setTriggers] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from("episodes")
      .select("id,title,severity,started_at,ended_at,symptoms,triggers,notes")
      .order("started_at", { ascending: false })
      .limit(200);
    setRows((data ?? []) as EpisodeRow[]);
  }
  useEffect(() => {
    load();
  }, []);

  async function add() {
    setErr(null);
    if (!title.trim()) return setErr("Give the episode a short title.");
    const { error } = await supabase.from("episodes").insert({
      user_id: userId,
      title: title.trim(),
      severity: severity ? Number(severity) : null,
      started_at: toIso(started),
      symptoms: symptoms.trim() || null,
      triggers: triggers.trim() || null,
    });
    if (error) setErr(error.message);
    else {
      setTitle("");
      setSymptoms("");
      setTriggers("");
      await load();
    }
  }
  async function endEpisode(id: string) {
    await supabase.from("episodes").update({ ended_at: new Date().toISOString() }).eq("id", id);
    await load();
  }

  return (
    <div>
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
            <br />
            <small style={hint}>
              {new Date(r.started_at).toLocaleString()} {r.ended_at ? `→ ${new Date(r.ended_at).toLocaleString()}` : "· ongoing"}
            </small>
            {r.symptoms && <div style={hint}>Symptoms: {r.symptoms}</div>}
            {!r.ended_at && (
              <button style={{ ...btnGhost, marginTop: 6 }} onClick={() => endEpisode(r.id)}>Mark ended</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ============================ Doctor questions ============================ */
function QuestionsSection({ userId }: { userId: string }) {
  const [rows, setRows] = useState<QuestionRow[]>([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from("doctor_questions")
      .select("id,question,answered,answer,created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    setRows((data ?? []) as QuestionRow[]);
  }
  useEffect(() => {
    load();
  }, []);

  async function add() {
    setErr(null);
    if (!q.trim()) return;
    const { error } = await supabase.from("doctor_questions").insert({ user_id: userId, question: q.trim() });
    if (error) setErr(error.message);
    else {
      setQ("");
      await load();
    }
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
    <div>
      <h3 style={h3}>Questions for your doctor</h3>
      <p style={hint}>Jot things down as they come up so you don’t forget them at your visit.</p>
      <div style={{ display: "flex", gap: 8 }}>
        <input style={{ ...input, flex: 1 }} placeholder="e.g. Is my salt intake okay with my kidney labs?" value={q} onChange={(e) => setQ(e.target.value)} />
        <button style={btn} onClick={add}>Add</button>
      </div>
      {err && <p style={errText}>{err}</p>}
      <ul style={ul}>
        {rows.map((r) => (
          <li key={r.id} style={li}>
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <input type="checkbox" checked={r.answered} onChange={() => toggle(r.id, r.answered)} />
              <span style={{ textDecoration: r.answered ? "line-through" : "none", color: r.answered ? "#94a3b8" : "inherit" }}>
                {r.question}
              </span>
            </label>
            {r.answered && (
              <input
                style={{ ...input, marginTop: 6 }}
                placeholder="answer / note from your doctor"
                defaultValue={r.answer ?? ""}
                onBlur={(e) => e.target.value !== (r.answer ?? "") && saveAnswer(r.id, e.target.value)}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ============================ Appointments ============================ */
function AppointmentsSection({ userId }: { userId: string }) {
  const [rows, setRows] = useState<ApptRow[]>([]);
  const [title, setTitle] = useState("");
  const [provider, setProvider] = useState("");
  const [when, setWhen] = useState(nowLocal());
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from("appointments")
      .select("id,title,provider,location,scheduled_at,notes,status")
      .order("scheduled_at", { ascending: true })
      .limit(200);
    setRows((data ?? []) as ApptRow[]);
  }
  useEffect(() => {
    load();
  }, []);

  async function add() {
    setErr(null);
    if (!title.trim()) return setErr("Give the appointment a title.");
    const { error } = await supabase.from("appointments").insert({
      user_id: userId,
      title: title.trim(),
      provider: provider.trim() || null,
      scheduled_at: toIso(when),
    });
    if (error) setErr(error.message);
    else {
      setTitle("");
      setProvider("");
      await load();
    }
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
    <div>
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
            <br />
            <small style={hint}>{new Date(r.scheduled_at).toLocaleString()}{r.provider ? ` · ${r.provider}` : ""}</small>
            <br />
            <button style={{ ...btnGhost, marginTop: 6 }} onClick={() => complete(r.id)}>Mark completed</button>
          </li>
        ))}
      </ul>
      {past.length > 0 && (
        <>
          <h3 style={{ ...h3, marginTop: 10, color: "#94a3b8" }}>Past / completed</h3>
          <ul style={ul}>
            {past.map((r) => (
              <li key={r.id} style={{ ...li, color: "#94a3b8" }}>
                {r.title} — {new Date(r.scheduled_at).toLocaleDateString()}
              </li>
            ))}
          </ul>
        </>
      )}
      <p style={{ ...hint, marginTop: 8 }}>
        Reminders are stored with each appointment; automated push/email notifications are a follow-up step (needs a scheduled job).
      </p>
    </div>
  );
}

/* ---------- shared inline styles ---------- */
const card: React.CSSProperties = { background: "white", borderRadius: 12, padding: 20, marginTop: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" };
const h3: React.CSSProperties = { fontSize: "1.05rem", margin: "0 0 8px" };
const hint: React.CSSProperties = { color: "#64748b", fontSize: 13, margin: "4px 0" };
const input: React.CSSProperties = { display: "block", width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #cbd5e1", margin: "6px 0", boxSizing: "border-box", fontSize: 14 };
const btn: React.CSSProperties = { background: "#2563eb", color: "white", border: "none", borderRadius: 8, padding: "9px 14px", cursor: "pointer", fontSize: 14 };
const btnGhost: React.CSSProperties = { background: "#e2e8f0", color: "#0f172a", border: "none", borderRadius: 8, padding: "7px 12px", cursor: "pointer", fontSize: 13 };
const tabBtn: React.CSSProperties = { background: "#f1f5f9", color: "#334155", border: "none", borderRadius: 999, padding: "6px 12px", cursor: "pointer", fontSize: 13 };
const tabActive: React.CSSProperties = { background: "#2563eb", color: "white" };
const ul: React.CSSProperties = { listStyle: "none", padding: 0, marginTop: 12 };
const li: React.CSSProperties = { padding: "10px 0", borderBottom: "1px solid #f1f5f9", fontSize: 14 };
const errText: React.CSSProperties = { color: "#b91c1c", fontSize: 13 };
