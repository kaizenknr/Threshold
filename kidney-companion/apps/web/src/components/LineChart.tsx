"use client";

export interface ChartPoint {
  t: number; // epoch ms
  y: number;
}

/**
 * Minimal dependency-free SVG line chart. Scales to its container width,
 * plots points over time, and labels the min/max and date range. Theme-agnostic.
 */
export function LineChart({
  points,
  unit,
  color = "#2563eb",
  height = 160,
}: {
  points: ChartPoint[];
  unit?: string | null;
  color?: string;
  height?: number;
}) {
  const W = 320;
  const H = height;
  const pad = { top: 16, right: 12, bottom: 22, left: 34 };

  if (points.length === 0) {
    return <p style={{ color: "#64748b", fontSize: 13 }}>No readings yet — log one above to see it graphed.</p>;
  }

  const sorted = [...points].sort((a, b) => a.t - b.t);
  const ys = sorted.map((p) => p.y);
  const ts = sorted.map((p) => p.t);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const minT = Math.min(...ts);
  const maxT = Math.max(...ts);
  const spanY = maxY - minY || 1;
  const spanT = maxT - minT || 1;

  const x = (t: number) => pad.left + ((t - minT) / spanT) * (W - pad.left - pad.right);
  const y = (v: number) => pad.top + (1 - (v - minY) / spanY) * (H - pad.top - pad.bottom);

  const d = sorted.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.t).toFixed(1)} ${y(p.y).toFixed(1)}`).join(" ");
  const fmtDate = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="readings over time" style={{ maxWidth: 520 }}>
      {/* y gridlines: min, mid, max */}
      {[maxY, (maxY + minY) / 2, minY].map((v, i) => {
        const yy = y(v);
        return (
          <g key={i}>
            <line x1={pad.left} y1={yy} x2={W - pad.right} y2={yy} stroke="#e2e8f0" strokeWidth={1} />
            <text x={pad.left - 4} y={yy + 3} textAnchor="end" fontSize={8} fill="#94a3b8">
              {Number.isInteger(v) ? v : v.toFixed(1)}
            </text>
          </g>
        );
      })}
      {/* line + points */}
      <path d={d} fill="none" stroke={color} strokeWidth={2} />
      {sorted.map((p, i) => (
        <circle key={i} cx={x(p.t)} cy={y(p.y)} r={2.5} fill={color} />
      ))}
      {/* x labels: first & last */}
      <text x={pad.left} y={H - 6} fontSize={8} fill="#94a3b8">{fmtDate(minT)}</text>
      <text x={W - pad.right} y={H - 6} textAnchor="end" fontSize={8} fill="#94a3b8">{fmtDate(maxT)}</text>
      {unit && (
        <text x={pad.left} y={10} fontSize={8} fill="#64748b">{unit}</text>
      )}
    </svg>
  );
}
