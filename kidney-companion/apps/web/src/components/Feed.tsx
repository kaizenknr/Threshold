"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { btn, btnGhost, card, chip, chipOn, h3, hint, sectionTitle } from "./ui";

type Cond = { id: string; name: string };
type View = "home" | "nutrition" | "labs" | "targets" | "track" | "meds" | "episodes" | "questions" | "appts" | "pregnancy" | "profile";

export function Feed({ myConditions, onNavigate }: { myConditions: Cond[]; onNavigate: (v: View) => void }) {
  const [nextAppt, setNextAppt] = useState<{ title: string; scheduled_at: string; provider: string | null } | null>(null);
  const [openQs, setOpenQs] = useState(0);
  const [lastEpisode, setLastEpisode] = useState<{ title: string; started_at: string; ended_at: string | null } | null>(null);

  useEffect(() => {
    const now = new Date().toISOString();
    supabase.from("appointments").select("title,scheduled_at,provider").eq("status", "scheduled").gte("scheduled_at", now).order("scheduled_at", { ascending: true }).limit(1).maybeSingle().then(({ data }) => setNextAppt(data as never));
    supabase.from("doctor_questions").select("id", { count: "exact", head: true }).eq("answered", false).then(({ count }) => setOpenQs(count ?? 0));
    supabase.from("episodes").select("title,started_at,ended_at").order("started_at", { ascending: false }).limit(1).maybeSingle().then(({ data }) => setLastEpisode(data as never));
  }, []);

  const countdown = (iso: string) => {
    const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
    return days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={card}>
        <h1 style={sectionTitle}>Your health, in one place</h1>
        <p style={hint}>Managing {myConditions.map((c) => c.name).join(", ") || "your conditions"}.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {myConditions.map((c) => <span key={c.id} style={{ ...chip, ...chipOn }}>{c.name}</span>)}
          <button style={chip} onClick={() => onNavigate("profile")}>+ manage</button>
        </div>
      </div>

      {/* Quick actions */}
      <div style={card}>
        <h3 style={h3}>Quick add</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btn} onClick={() => onNavigate("nutrition")}>＋ Food</button>
          <button style={btn} onClick={() => onNavigate("labs")}>＋ Lab result</button>
          <button style={btnGhost} onClick={() => onNavigate("track")}>＋ Reading</button>
          <button style={btnGhost} onClick={() => onNavigate("episodes")}>＋ Flare-up</button>
          <button style={btnGhost} onClick={() => onNavigate("meds")}>＋ Med / dose</button>
          <button style={btnGhost} onClick={() => onNavigate("questions")}>＋ Doctor question</button>
          <button style={btnGhost} onClick={() => onNavigate("appts")}>＋ Appointment</button>
        </div>
      </div>

      {/* Next appointment */}
      <div style={card} onClick={() => onNavigate("appts")} role="button">
        <h3 style={h3}>Next appointment</h3>
        {nextAppt ? (
          <p style={{ margin: 0 }}>
            <strong>{nextAppt.title}</strong> <span style={{ color: "#2563eb", fontWeight: 600 }}>· {countdown(nextAppt.scheduled_at)}</span>
            <br /><small style={hint}>{new Date(nextAppt.scheduled_at).toLocaleString()}{nextAppt.provider ? ` · ${nextAppt.provider}` : ""}</small>
          </p>
        ) : <p style={hint}>Nothing scheduled — tap to add one.</p>}
      </div>

      {/* Open questions */}
      <div style={card} onClick={() => onNavigate("questions")} role="button">
        <h3 style={h3}>Questions for your doctor</h3>
        <p style={hint}>{openQs > 0 ? `${openQs} open question${openQs === 1 ? "" : "s"} to bring to your next visit.` : "No open questions — tap to add one."}</p>
      </div>

      {/* Last flare-up */}
      <div style={card} onClick={() => onNavigate("episodes")} role="button">
        <h3 style={h3}>Most recent flare-up</h3>
        {lastEpisode ? (
          <p style={{ margin: 0 }}><strong>{lastEpisode.title}</strong><br /><small style={hint}>{new Date(lastEpisode.started_at).toLocaleDateString()} {lastEpisode.ended_at ? "" : "· ongoing"}</small></p>
        ) : <p style={hint}>None logged yet — tap to record one.</p>}
      </div>
    </div>
  );
}
