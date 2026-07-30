"use client";

import { useEffect, useState } from "react";
import type { EffectiveTarget } from "@kidney/shared";
import { computeConditionTargets } from "@/lib/targetsClient";
import { card, h3, hint, li, ul } from "./ui";

type Cond = { id: string; name: string };

export function Targets({ userId, myConditions }: { userId: string; myConditions: Cond[] }) {
  const [byCondition, setByCondition] = useState<Record<string, EffectiveTarget[] | null>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const entries = await Promise.all(
        myConditions.map(async (c) => [c.id, await computeConditionTargets(userId, c.id)] as const),
      );
      setByCondition(Object.fromEntries(entries));
      setLoading(false);
    })();
  }, [userId, myConditions]);

  if (loading) return <div style={card}><p style={hint}>Loading your targets…</p></div>;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <p style={hint}>
        General guideline ranges for your conditions. If your doctor gave you specific numbers, add them in Profile — a
        “Doctor’s number” always takes precedence over the general range.
      </p>
      {myConditions.map((c) => {
        const targets = byCondition[c.id];
        return (
          <div key={c.id} style={card}>
            <h3 style={h3}>{c.name}</h3>
            {!targets ? (
              <p style={hint}>No built-in guideline data for this condition yet — you can still track readings and log flare-ups for it.</p>
            ) : (
              <ul style={ul}>
                {targets.map((t) => (
                  <li key={t.key} style={li}>
                    <strong>{t.label}</strong>
                    {t.override ? (
                      <>
                        {" — "}<span style={{ color: "#1e40af", fontWeight: 600 }}>Doctor’s number: {t.override.value}</span>
                        {!t.override.verified && <span style={{ color: "#b45309" }}> (unconfirmed)</span>}
                        <br /><small style={hint}>Guideline: {t.range}</small>
                      </>
                    ) : (
                      <>
                        {" — "}{t.range}{" "}
                        {t.conditional && <small style={hint}>(only if advised)</small>}
                        {t.source && <><br /><small style={hint}>Source: {t.source}</small></>}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
