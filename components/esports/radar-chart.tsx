"use client";

import { useId } from "react";
import type { PlayerAxis } from "@/app/api/widgets/esports/player/[id]/route";

/**
 * 4-axis radar for a player's dimensional percentiles.
 *
 * The API returns values ALREADY on a 0-100 percentile scale (verified across
 * six players: 1.8 → 94.1), so they plot directly against a fixed 0-100 axis —
 * no normalisation, which means the shape is comparable between players.
 *
 * Hand-rolled SVG to match the other charts here; no chart library involved.
 */

const SIZE = 300;
const C = SIZE / 2;
const R = 104;
// Axis labels sit outside the plot radius, so the viewBox is widened around
// the square plot area — otherwise "CLUTCH"/"ENTRY" render clipped to "TCH"/"ENTF".
const PAD_X = 62;
const PAD_Y = 16;
const RINGS = [25, 50, 75, 100];

/** Angle for axis i, starting at 12 o'clock and going clockwise. */
function point(i: number, total: number, radius: number) {
  const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
  return { x: C + radius * Math.cos(angle), y: C + radius * Math.sin(angle) };
}

export default function RadarChart({ axes }: { axes: PlayerAxis[] }) {
  const uid = useId().replace(/:/g, "");
  const n = axes.length;

  // A null axis is plotted at the centre rather than dropped, so the polygon
  // keeps its shape and the gap is visible instead of silently distorting.
  const values = axes.map((a) => (typeof a.value === "number" ? Math.max(0, Math.min(100, a.value)) : 0));
  const allZero = values.every((v) => v === 0);

  const polygon = values
    .map((v, i) => {
      const p = point(i, n, (v / 100) * R);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`${-PAD_X} ${-PAD_Y} ${SIZE + PAD_X * 2} ${SIZE + PAD_Y * 2}`}
           className="w-full h-auto overflow-visible" style={{ maxWidth: SIZE + PAD_X }} role="img"
           aria-label={`Radar: ${axes.map((a) => `${a.label} ${a.value ?? "n/a"}`).join(", ")}`}>
        <defs>
          <radialGradient id={`radar-fill-${uid}`}>
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.12" />
          </radialGradient>
        </defs>

        {/* Grid rings + their percentile labels */}
        {RINGS.map((ring) => {
          const rr = (ring / 100) * R;
          const pts = Array.from({ length: n }, (_, i) => {
            const p = point(i, n, rr);
            return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
          }).join(" ");
          return (
            <g key={ring}>
              <polygon points={pts} fill="none" stroke="rgba(148,163,184,0.22)" strokeWidth="1" />
              <text x={C + 3} y={C - rr - 2} fill="rgba(148,163,184,0.45)"
                    fontSize="7" fontFamily="JetBrains Mono, monospace">
                {ring}
              </text>
            </g>
          );
        })}

        {/* Spokes */}
        {axes.map((a, i) => {
          const p = point(i, n, R);
          return (
            <line key={a.key} x1={C} y1={C} x2={p.x} y2={p.y}
                  stroke="rgba(34,211,238,0.28)" strokeWidth="1" />
          );
        })}

        {/* Value polygon */}
        {!allZero && (
          <>
            <polygon points={polygon} fill={`url(#radar-fill-${uid})`} stroke="#22d3ee"
                     strokeWidth="2" strokeLinejoin="round"
                     style={{ filter: "drop-shadow(0 0 6px rgba(34,211,238,0.65))" }} />
            {values.map((v, i) => {
              const p = point(i, n, (v / 100) * R);
              const axis = axes[i];
              return (
                <circle key={axis.key} cx={p.x} cy={p.y} r="3.4"
                        fill={axis.lowConfidence ? "#fbbf24" : "#22d3ee"}
                        style={{ filter: `drop-shadow(0 0 5px ${axis.lowConfidence ? "#fbbf24" : "#22d3ee"})` }} />
              );
            })}
          </>
        )}

        {/* Axis labels + values at the outer ends */}
        {axes.map((a, i) => {
          const p = point(i, n, R + 26);
          const anchor = Math.abs(p.x - C) < 6 ? "middle" : p.x > C ? "start" : "end";
          return (
            <g key={`${a.key}-label`}>
              <text x={p.x} y={p.y} textAnchor={anchor} fill="#cbd5e1"
                    fontSize="10" fontFamily="Oswald, sans-serif"
                    letterSpacing="1.4" style={{ textTransform: "uppercase" }}>
                {a.label}
              </text>
              <text x={p.x} y={p.y + 12} textAnchor={anchor}
                    fill={a.value == null ? "#64748b" : a.lowConfidence ? "#fbbf24" : "#22d3ee"}
                    fontSize="11" fontFamily="JetBrains Mono, monospace"
                    style={{ filter: "drop-shadow(0 0 4px rgba(34,211,238,0.4))" }}>
                {a.value == null ? "n/a" : a.value.toFixed(1)}
              </text>
            </g>
          );
        })}
      </svg>

      {allZero && (
        <p className="font-mono text-[10px] text-slate-500 mt-1">
          All axes read zero — nothing to plot.
        </p>
      )}
      {axes.some((a) => a.lowConfidence) && (
        <p className="font-mono text-[9px] text-amber-300/80 mt-2">
          ● amber = low confidence on that axis
        </p>
      )}
      <p className="font-mono text-[8.5px] uppercase tracking-[0.2em] text-slate-600 mt-1">
        percentile vs leaderboard · 0–100
      </p>
    </div>
  );
}
