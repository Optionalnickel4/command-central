"use client";

import { useId } from "react";

/**
 * Animated live line/area graph for a rolling metric window.
 * Feed it points from useRollingHistory(). Values are 0..max (default 100,
 * i.e. percentages). Draws its own gradient fill, glow stroke, gridlines and
 * a pulsing head marker at the newest sample.
 */

const W = 100;
const H = 32;

function buildPath(points: number[], max: number): string {
  const n = points.length;
  if (n === 0) return "";
  const x = (i: number) => (n === 1 ? W : (i / (n - 1)) * W);
  const y = (v: number) => H - (Math.max(0, Math.min(max, v)) / max) * H;

  if (n === 1) return `M0,${y(points[0])} L${W},${y(points[0])}`;

  // Smooth with a symmetric cubic through each pair of samples.
  let d = `M${x(0)},${y(points[0])}`;
  for (let i = 1; i < n; i++) {
    const px = x(i - 1);
    const py = y(points[i - 1]);
    const cx = x(i);
    const cy = y(points[i]);
    const mid = (px + cx) / 2;
    d += ` C${mid},${py} ${mid},${cy} ${cx},${cy}`;
  }
  return d;
}

export default function HistoryGraph({
  points,
  label,
  color = "#22d3ee",
  max = 100,
  unit = "%",
  height = 56
}: {
  points: number[];
  label: string;
  color?: string;
  max?: number;
  unit?: string;
  height?: number;
}) {
  const uid = useId().replace(/:/g, "");
  const fillId = `hg-fill-${uid}`;

  const current = points.length ? points[points.length - 1] : null;
  const peak = points.length ? Math.max(...points) : null;
  const line = buildPath(points, max);
  const area = line ? `${line} L${W},${H} L0,${H} Z` : "";
  const headY = current == null ? 0 : (1 - Math.max(0, Math.min(max, current)) / max) * 100;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-slate-500">
          {label}
        </span>
        <span className="font-mono text-[10px] tabular-nums" style={{ color }}>
          {current == null ? "—" : `${Math.round(current)}${unit}`}
          {peak != null && (
            <span className="text-slate-600 ml-1.5">peak {Math.round(peak)}{unit}</span>
          )}
        </span>
      </div>

      <div className="relative" style={{ height }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="w-full h-full overflow-visible"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.38" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Gridlines at 25 / 50 / 75% */}
          {[0.25, 0.5, 0.75].map((g) => (
            <line
              key={g}
              x1="0" x2={W}
              y1={H * g} y2={H * g}
              stroke="rgba(148,163,184,0.12)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
              strokeDasharray="2 4"
            />
          ))}

          {points.length >= 2 && (
            <>
              <path d={area} fill={`url(#${fillId})`} />
              <path
                d={line}
                fill="none"
                stroke={color}
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                className="graph-draw"
                style={{
                  filter: `drop-shadow(0 0 3px ${color})`,
                  // Long enough to cover any path length; the draw-in reads
                  // as a sweep regardless of how many samples exist yet.
                  strokeDasharray: 400,
                  ["--len" as string]: 400
                }}
              />
            </>
          )}
        </svg>

        {/* Live head marker — a div so it stays circular despite the
            non-uniform SVG scaling. */}
        {current != null && points.length >= 2 && (
          <span
            className="absolute h-1.5 w-1.5 rounded-full graph-head"
            style={{
              left: "100%",
              top: `${headY}%`,
              transform: "translate(-50%, -50%)",
              background: color,
              boxShadow: `0 0 8px ${color}`,
              transition: "top 0.6s cubic-bezier(0.22,1,0.36,1)"
            }}
          />
        )}

        {points.length < 2 && (
          <span className="absolute inset-0 flex items-center justify-center font-mono text-[9.5px] uppercase tracking-[0.2em] text-slate-600">
            Collecting samples…
          </span>
        )}
      </div>

      <div className="flex justify-between font-mono text-[8.5px] uppercase tracking-[0.2em] text-slate-600 mt-1">
        <span>{points.length} samples</span>
        <span>now</span>
      </div>
    </div>
  );
}
