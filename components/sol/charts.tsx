"use client";

import { useId } from "react";

/**
 * Small SVG chart vocabulary for the Sol stats page.
 *
 * Hand-rolled rather than pulling in a chart library: the HUD look is bespoke
 * (mono type, thin strokes, glow), and restyling a general-purpose library to
 * match costs more than these few shapes — and adds a large client bundle to a
 * LAN dashboard.
 */

export const HUD_COLORS = ["#22d3ee", "#fbbf24", "#34d399", "#f43f5e", "#a78bfa", "#38bdf8"];

/** Big readout tile. */
export function StatTile({
  label, value, sub, tone = "cyan"
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "cyan" | "amber" | "green" | "red" | "dim";
}) {
  const color = {
    cyan: "#22d3ee", amber: "#fbbf24", green: "#34d399", red: "#f43f5e", dim: "#94a3b8"
  }[tone];
  return (
    <div className="rounded border border-cyan-500/12 bg-slate-950/30 px-3 py-2.5 min-w-0">
      <p className="font-mono text-[8.5px] uppercase tracking-[0.22em] text-slate-500 truncate">{label}</p>
      <p
        className="font-mono text-xl font-bold tabular-nums mt-0.5 truncate"
        style={{ color, textShadow: `0 0 10px ${color}55` }}
      >
        {value}
      </p>
      {sub && <p className="font-mono text-[9px] text-slate-500 mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

/** Donut for a small number of parts (e.g. succeeded vs failed). */
export function Donut({
  segments, centerValue, centerLabel, size = 132
}: {
  segments: { label: string; value: number; color: string }[];
  centerValue: string;
  centerLabel: string;
  size?: number;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = 52;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 132 132" style={{ width: size, height: size }} className="-rotate-90">
          <circle cx="66" cy="66" r={r} fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth="13" />
          {total > 0 && segments.map((s) => {
            const frac = s.value / total;
            const dash = circumference * frac;
            const el = (
              <circle
                key={s.label}
                cx="66" cy="66" r={r}
                fill="none" stroke={s.color} strokeWidth="13"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                className="donut-seg"
                style={{ filter: `drop-shadow(0 0 5px ${s.color}88)` }}
              />
            );
            offset += dash;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-lg font-bold hud-glow-text tabular-nums">{centerValue}</span>
          <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-slate-500">{centerLabel}</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 min-w-0">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2 font-mono text-[10.5px] min-w-0">
            <span className="h-2 w-2 rounded-sm shrink-0" style={{ background: s.color, boxShadow: `0 0 6px ${s.color}` }} />
            <span className="text-slate-400 truncate flex-1">{s.label}</span>
            <span className="tabular-nums text-slate-200">{s.value}</span>
            <span className="tabular-nums text-slate-600 w-9 text-right">
              {total ? `${Math.round((s.value / total) * 100)}%` : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Labelled horizontal bars for a category breakdown. */
export function BarRows({
  rows, color = "#22d3ee", emptyLabel = "No data", labelWidth = "w-24"
}: {
  rows: { label: string; value: number }[];
  color?: string;
  emptyLabel?: string;
  /** Widen for long keys like "agent.run.finished". */
  labelWidth?: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  if (rows.length === 0) return <p className="font-mono text-[10.5px] text-slate-500">{emptyLabel}</p>;
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 min-w-0">
          <span className={`font-mono text-[10px] text-slate-400 ${labelWidth} truncate shrink-0`}>{r.label}</span>
          <span className="flex-1 h-[7px] rounded-sm bg-slate-800/60 overflow-hidden min-w-0">
            <span
              className="block h-full rounded-sm bar-fill"
              style={{
                width: `${(r.value / max) * 100}%`,
                background: `linear-gradient(90deg, ${color}55, ${color})`,
                boxShadow: `0 0 7px ${color}66`
              }}
            />
          </span>
          <span className="font-mono text-[10.5px] tabular-nums text-slate-200 w-10 text-right shrink-0">
            {r.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Two-part stacked columns, e.g. input vs output tokens per turn. */
export function StackedBars({
  rows, height = 96, colors = ["#22d3ee", "#fbbf24"], labels = ["a", "b"], unit = ""
}: {
  rows: { a: number; b: number; title?: string }[];
  height?: number;
  colors?: [string, string] | string[];
  labels?: string[];
  unit?: string;
}) {
  if (rows.length === 0)
    return <p className="font-mono text-[10.5px] text-slate-500">No turns recorded yet.</p>;
  const max = Math.max(...rows.map((r) => r.a + r.b), 1);

  return (
    <div>
      {/* Bars are capped in width and left-aligned: with only a handful of
          turns, full-flex columns become meaningless full-panel slabs. */}
      <div className="flex items-end gap-[2px] justify-start" style={{ height }}>
        {rows.map((r, i) => (
          <div
            key={i}
            className="flex-1 flex flex-col justify-end min-w-0 h-full"
            style={{ maxWidth: 26 }}
            title={r.title ?? `${labels[0]} ${r.a}${unit} · ${labels[1]} ${r.b}${unit}`}
          >
            <span className="block w-full bar-fill" style={{
              height: `${(r.b / max) * 100}%`, background: colors[1], opacity: 0.9
            }} />
            <span className="block w-full bar-fill" style={{
              height: `${(r.a / max) * 100}%`, background: colors[0],
              boxShadow: `0 0 5px ${colors[0]}55`
            }} />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 mt-2">
        {labels.map((l, i) => (
          <span key={l} className="flex items-center gap-1.5 font-mono text-[9px] text-slate-500">
            <span className="h-1.5 w-1.5 rounded-sm" style={{ background: colors[i] }} />
            {l}
          </span>
        ))}
        <span className="font-mono text-[9px] text-slate-600 ml-auto">peak {max.toLocaleString()}{unit}</span>
      </div>
    </div>
  );
}

/** Simple line/area series with min-max labels — latency, context growth, … */
export function LineSeries({
  points, height = 84, color = "#22d3ee", unit = "", label
}: {
  points: number[];
  height?: number;
  color?: string;
  unit?: string;
  label?: string;
}) {
  if (points.length < 2)
    return <p className="font-mono text-[10.5px] text-slate-500">Not enough turns yet.</p>;

  const W = 100;
  const H = 32;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => H - ((v - min) / span) * H;

  let d = `M${x(0)},${y(points[0])}`;
  for (let i = 1; i < points.length; i++) {
    const mid = (x(i - 1) + x(i)) / 2;
    d += ` C${mid},${y(points[i - 1])} ${mid},${y(points[i])} ${x(i)},${y(points[i])}`;
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        {label && <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-slate-500">{label}</span>}
        <span className="font-mono text-[10px] tabular-nums" style={{ color }}>
          {Math.round(points[points.length - 1]).toLocaleString()}{unit}
        </span>
      </div>
      <div style={{ height }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full overflow-visible" aria-hidden="true">
          <path d={`${d} L${W},${H} L0,${H} Z`} fill={color} fillOpacity="0.14" />
          <path d={d} fill="none" stroke={color} strokeWidth="1.6"
                vectorEffect="non-scaling-stroke" strokeLinecap="round"
                style={{ filter: `drop-shadow(0 0 3px ${color})` }} />
        </svg>
      </div>
      <div className="flex justify-between font-mono text-[8.5px] text-slate-600 mt-1">
        <span>min {Math.round(min).toLocaleString()}{unit}</span>
        <span>{points.length} turns</span>
        <span>max {Math.round(max).toLocaleString()}{unit}</span>
      </div>
    </div>
  );
}

/** Stacked columns over time — one column per bucket. */
export function TimelineChart({
  buckets, height = 90
}: {
  buckets: { hour: number; started: number; succeeded: number; failed: number; blocked: number }[];
  height?: number;
}) {
  const uid = useId().replace(/:/g, "");
  if (buckets.length === 0)
    return <p className="font-mono text-[10.5px] text-slate-500">No activity in the audit window.</p>;

  const series = [
    { key: "succeeded" as const, color: "#34d399" },
    { key: "failed" as const, color: "#f43f5e" },
    { key: "blocked" as const, color: "#fbbf24" },
    { key: "started" as const, color: "#22d3ee" }
  ];
  const totals = buckets.map((b) => b.succeeded + b.failed + b.blocked + b.started);
  const max = Math.max(...totals, 1);

  const fmt = (h: number) =>
    new Date(h).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });

  return (
    <div>
      <div className="flex items-end gap-[3px]" style={{ height }}>
        {buckets.map((b) => {
          const total = b.succeeded + b.failed + b.blocked + b.started;
          return (
            <div
              key={`${uid}-${b.hour}`}
              className="flex-1 flex flex-col justify-end min-w-0"
              style={{ height: "100%" }}
              title={`${fmt(b.hour)} — ${total} events`}
            >
              {series.map((s) => {
                const v = b[s.key];
                if (!v) return null;
                return (
                  <span
                    key={s.key}
                    className="block w-full bar-fill"
                    style={{
                      height: `${(v / max) * 100}%`,
                      background: s.color,
                      boxShadow: `0 0 5px ${s.color}66`,
                      opacity: 0.9
                    }}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between font-mono text-[8.5px] text-slate-600 mt-1.5">
        <span>{fmt(buckets[0].hour)}</span>
        <span>{buckets.length} hourly buckets</span>
        <span>{fmt(buckets[buckets.length - 1].hour)}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 font-mono text-[9px] text-slate-500">
            <span className="h-1.5 w-1.5 rounded-sm" style={{ background: s.color }} />
            {s.key}
          </span>
        ))}
      </div>
    </div>
  );
}
