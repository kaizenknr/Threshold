"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { Home } from "@/components/Home";

const TERMS_VERSION = process.env.NEXT_PUBLIC_CONSENT_TERMS_VERSION ?? "2026-07-01";

const DISCLAIMER =
  "Kidney Companion is an informational tool, not a medical device. It does not diagnose or treat, and it never tells you to start, stop, or change a medication, food, or fluid. Your care team decides what fits you.";

export default function Page() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [consented, setConsented] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    supabase
      .from("consents")
      .select("id")
      .eq("terms_version", TERMS_VERSION)
      .maybeSingle()
      .then(({ data }) => setConsented(!!data));
  }, [session]);

  async function signIn() {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      // Land the magic link back on whatever URL the user is currently using
      // (works across Vercel preview/production URLs; the redirect allow-list
      // is a wildcard for this project).
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) setError(error.message);
    else setSent(true);
  }

  async function acceptTerms() {
    const { error } = await supabase
      .from("consents")
      .insert({ user_id: session!.user.id, terms_version: TERMS_VERSION });
    if (error) setError(error.message);
    else setConsented(true);
  }

  return (
    <div>
      <h1 style={{ fontSize: "1.75rem" }}>Kidney Companion</h1>
      <p style={{ color: "#475569", fontSize: 14 }}>{DISCLAIMER}</p>

      {!session && (
        <section style={card}>
          <h2 style={h2}>Sign in</h2>
          {sent ? (
            <p>Check your email for a magic link.</p>
          ) : (
            <>
              <input
                style={input}
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button style={btn} onClick={signIn} disabled={!email}>
                Send magic link
              </button>
            </>
          )}
        </section>
      )}

      {session && !consented && (
        <section style={card}>
          <h2 style={h2}>Before you continue</h2>
          <p style={{ fontSize: 14 }}>{DISCLAIMER}</p>
          <button style={btn} onClick={acceptTerms}>
            I understand and accept (v{TERMS_VERSION})
          </button>
        </section>
      )}

      {session && consented && <Home userId={session.user.id} email={session.user.email} />}

      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
    </div>
  );
}

const card: React.CSSProperties = {
  background: "white",
  borderRadius: 12,
  padding: 20,
  marginTop: 16,
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
};
const h2: React.CSSProperties = { fontSize: "1.1rem", marginTop: 0 };
const input: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  marginBottom: 10,
  boxSizing: "border-box",
};
const btn: React.CSSProperties = {
  background: "#2563eb",
  color: "white",
  border: "none",
  borderRadius: 8,
  padding: "10px 14px",
  cursor: "pointer",
  marginRight: 8,
};
