"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Onboarding } from "./Onboarding";
import { Feed } from "./Feed";
import { Targets } from "./Targets";
import { Profile } from "./Profile";
import { AppointmentsSection, EpisodesSection, PregnancySection, QuestionsSection, TrackSection } from "./sections";

type Cond = { id: string; name: string };
type View = "home" | "targets" | "track" | "episodes" | "questions" | "appts" | "pregnancy" | "profile";

const NAV: { id: View; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "targets", label: "Targets" },
  { id: "track", label: "Track" },
  { id: "episodes", label: "Flare-ups" },
  { id: "questions", label: "Questions" },
  { id: "appts", label: "Visits" },
  { id: "pregnancy", label: "Pregnancy" },
];

export function Home({ userId, email }: { userId: string; email: string | undefined }) {
  const [conditions, setConditions] = useState<Cond[] | null>(null);
  const [view, setView] = useState<View>("home");

  const load = useCallback(async () => {
    const { data } = await supabase.from("health_profiles").select("condition_id, conditions(name)").eq("user_id", userId);
    type Joined = { name: string } | { name: string }[] | null;
    const rows = (data ?? []) as unknown as { condition_id: string; conditions: Joined }[];
    setConditions(
      rows.map((r) => {
        const joined = Array.isArray(r.conditions) ? r.conditions[0] : r.conditions;
        return { id: r.condition_id, name: joined?.name ?? r.condition_id };
      }),
    );
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  if (conditions === null) return <p style={{ color: "#64748b" }}>Loading…</p>;
  if (conditions.length === 0) return <Onboarding userId={userId} onDone={load} />;

  const conditionIds = conditions.map((c) => c.id);

  return (
    <div>
      {/* Sticky sectioned toolbar */}
      <header
        style={{
          position: "sticky", top: 0, zIndex: 10, background: "rgba(255,255,255,0.92)", backdropFilter: "blur(8px)",
          borderBottom: "1px solid #e5e9f0", margin: "0 -1rem", padding: "10px 1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <strong style={{ fontFamily: "Georgia, serif", fontSize: 18 }}>Kidney Companion</strong>
          <button
            onClick={() => setView("profile")}
            aria-label="Profile"
            style={{
              width: 34, height: 34, borderRadius: 999, border: "none", cursor: "pointer",
              background: view === "profile" ? "#2563eb" : "#e2e8f0", color: view === "profile" ? "white" : "#334155", fontWeight: 700,
            }}
          >
            {(email?.[0] ?? "?").toUpperCase()}
          </button>
        </div>
        <nav style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => setView(n.id)}
              style={{
                whiteSpace: "nowrap", border: "none", cursor: "pointer", borderRadius: 999, padding: "6px 13px", fontSize: 13, fontWeight: 600,
                background: view === n.id ? "#2563eb" : "#f1f5f9", color: view === n.id ? "white" : "#475569",
              }}
            >
              {n.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Scrolling content */}
      <main style={{ padding: "16px 0 40px" }}>
        {view === "home" && <Feed myConditions={conditions} onNavigate={setView} />}
        {view === "targets" && <Targets userId={userId} myConditions={conditions} />}
        {view === "track" && <TrackSection userId={userId} />}
        {view === "episodes" && <EpisodesSection userId={userId} />}
        {view === "questions" && <QuestionsSection userId={userId} />}
        {view === "appts" && <AppointmentsSection userId={userId} />}
        {view === "pregnancy" && <PregnancySection myConditionIds={conditionIds} />}
        {view === "profile" && <Profile userId={userId} email={email} myConditions={conditions} onChange={load} />}
      </main>
    </div>
  );
}
