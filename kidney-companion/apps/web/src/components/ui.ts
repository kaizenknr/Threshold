import type React from "react";

/* Shared inline styles + tiny helpers for the web UI. Dependency-free. */

export const toIso = (local: string) => (local ? new Date(local).toISOString() : new Date().toISOString());
export const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

export const card: React.CSSProperties = { background: "white", borderRadius: 14, padding: 18, boxShadow: "0 1px 3px rgba(15,23,42,0.08)", border: "1px solid #eef2f7" };
export const h3: React.CSSProperties = { fontSize: "1.05rem", margin: "0 0 8px" };
export const hint: React.CSSProperties = { color: "#64748b", fontSize: 13, margin: "4px 0" };
export const input: React.CSSProperties = { display: "block", width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #cbd5e1", margin: "6px 0", boxSizing: "border-box", fontSize: 14 };
export const btn: React.CSSProperties = { background: "#2563eb", color: "white", border: "none", borderRadius: 10, padding: "10px 15px", cursor: "pointer", fontSize: 14, fontWeight: 600 };
export const btnGhost: React.CSSProperties = { background: "#eef2f7", color: "#0f172a", border: "none", borderRadius: 10, padding: "8px 13px", cursor: "pointer", fontSize: 13, fontWeight: 500 };
export const ul: React.CSSProperties = { listStyle: "none", padding: 0, margin: "12px 0 0" };
export const li: React.CSSProperties = { padding: "10px 0", borderBottom: "1px solid #f1f5f9", fontSize: 14 };
export const errText: React.CSSProperties = { color: "#b91c1c", fontSize: 13 };
export const disclaimer: React.CSSProperties = { background: "#fff7ed", border: "1px solid #fed7aa", color: "#7c2d12", borderRadius: 10, padding: "10px 12px", fontSize: 13, margin: "4px 0 12px", lineHeight: 1.45 };
export const chip: React.CSSProperties = { background: "#f1f5f9", color: "#334155", borderRadius: 999, padding: "6px 12px", fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", border: "1px solid transparent" };
export const chipOn: React.CSSProperties = { background: "#dbeafe", color: "#1e40af", border: "1px solid #93c5fd" };
export const catBadge: React.CSSProperties = { fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, color: "#2563eb", background: "#eff6ff", borderRadius: 4, padding: "1px 6px", marginRight: 4 };
export const sectionTitle: React.CSSProperties = { fontSize: "1.35rem", margin: "0 0 2px", fontFamily: "Georgia, 'Times New Roman', serif" };
