import { useEffect, useState } from "react";
import { Button, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import type { Session } from "@supabase/supabase-js";
import type { EffectiveTarget } from "@kidney/shared";
import { supabase } from "./src/lib/supabaseClient";
import { api } from "./src/lib/api";

const TERMS_VERSION = process.env.EXPO_PUBLIC_CONSENT_TERMS_VERSION ?? "2026-07-01";
const DISCLAIMER =
  "Kidney Companion is an informational tool, not a medical device. It does not diagnose or treat, and never tells you to change a medication, food, or fluid. Your care team decides what fits you.";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [consented, setConsented] = useState(false);
  const [targets, setTargets] = useState<EffectiveTarget[] | null>(null);
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

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <StatusBar style="auto" />
      <Text style={styles.title}>Kidney Companion</Text>
      <Text style={styles.disclaimer}>{DISCLAIMER}</Text>

      {!session &&
        (sent ? (
          <Text>Check your email for a magic link.</Text>
        ) : (
          <View style={styles.card}>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <Button
              title="Send magic link"
              onPress={async () => {
                const { error } = await supabase.auth.signInWithOtp({ email });
                if (error) setError(error.message);
                else setSent(true);
              }}
            />
          </View>
        ))}

      {session && !consented && (
        <View style={styles.card}>
          <Text style={styles.disclaimer}>{DISCLAIMER}</Text>
          <Button
            title={`Accept (v${TERMS_VERSION})`}
            onPress={async () => {
              const { error } = await supabase
                .from("consents")
                .insert({ user_id: session.user.id, terms_version: TERMS_VERSION });
              if (error) setError(error.message);
              else setConsented(true);
            }}
          />
        </View>
      )}

      {session && consented && (
        <View style={styles.card}>
          <Button
            title="Load my CKD targets"
            onPress={async () => {
              setError(null);
              try {
                const res = await api.getTargets("ckd");
                setTargets(res.metrics);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          />
          {targets?.map((t) => (
            <Text key={t.key} style={styles.target}>
              {t.label}: {t.override ? `Doctor's number ${t.override.value}` : t.range}
            </Text>
          ))}
          <Button title="Sign out" onPress={() => supabase.auth.signOut()} />
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, gap: 12 },
  title: { fontSize: 24, fontWeight: "700" },
  disclaimer: { color: "#475569", fontSize: 13 },
  card: { backgroundColor: "white", borderRadius: 12, padding: 16, gap: 10 },
  input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, padding: 10 },
  target: { paddingVertical: 4 },
  error: { color: "#b91c1c" },
});
