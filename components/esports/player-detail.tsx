"use client";

import Link from "next/link";
import { useWidgetData } from "@/lib/fetcher";
import type { EsportsPlayerData } from "@/app/api/widgets/esports/player/[id]/route";
import RadarChart from "./radar-chart";

/** Stat tile matching the /sol vocabulary. */
function Tile({ label, value, sub, tone = "cyan" }: {
  label: string; value: string; sub?: string; tone?: "cyan" | "amber" | "dim";
}) {
  const color = { cyan: "#22d3ee", amber: "#fbbf24", dim: "#94a3b8" }[tone];
  return (
    <div className="rounded border border-cyan-500/12 bg-slate-950/30 px-3 py-2.5 min-w-0">
      <p className="font-mono text-[8.5px] uppercase tracking-[0.22em] text-slate-500 truncate">{label}</p>
      <p className="font-mono text-lg font-bold tabular-nums mt-0.5 truncate"
         style={{ color, textShadow: `0 0 10px ${color}55` }}>{value}</p>
      {sub && <p className="font-mono text-[9px] text-slate-500 mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

export default function PlayerDetail({ id }: { id: string }) {
  const { data, status, error } = useWidgetData<EsportsPlayerData>(
    `/api/widgets/esports/player/${id}`,
    120000
  );

  if (error || status === "error") {
    return (
      <div className="hud-panel p-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] hud-glow-red">Player feed offline</p>
        <p className="font-mono text-[10px] text-slate-500 mt-1">vlr-api did not return this player.</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="hud-panel p-5">
        <p className="font-mono text-[11px] hud-glow-text live-pulse">LOADING PLAYER…</p>
      </div>
    );
  }

  const lb = data.leaderboard;

  return (
    <div className="sol-grid flex-1 pb-4">
      {/* Identity + radar */}
      <div className="power-on" style={{ ["--i" as string]: 0 }}>
        <div className="hud-panel p-4 h-full">
          <div className="flex items-baseline justify-between gap-3 mb-3 pb-2 border-b border-cyan-500/15">
            <span className="font-display text-[12px] font-semibold uppercase tracking-[0.3em] hud-glow-text">
              Dimensions
            </span>
            {data.region && (
              <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">
                {data.region} · {data.timespan}
              </span>
            )}
          </div>

          {data.axes ? (
            <RadarChart axes={data.axes} />
          ) : (
            <div className="py-8 text-center">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-amber-300/80">
                No dimensional data
              </p>
              <p className="font-mono text-[10px] text-slate-500 mt-2 max-w-[280px] mx-auto leading-relaxed">
                {data.dimensionsNote}
              </p>
              <p className="font-mono text-[9px] text-slate-600 mt-2">
                Dimensions are only computed for players on a current leaderboard.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Leaderboard line */}
      <div className="power-on" style={{ ["--i" as string]: 1 }}>
        <div className="hud-panel p-4 h-full">
          <div className="flex items-baseline justify-between gap-3 mb-3 pb-2 border-b border-cyan-500/15">
            <span className="font-display text-[12px] font-semibold uppercase tracking-[0.3em] hud-glow-text">
              Leaderboard line
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">
              R2.0 = composite
            </span>
          </div>
          {lb ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Tile label="R2.0" value={lb.r2?.toFixed(2) ?? "—"} />
              <Tile label="ACS" value={lb.acs != null ? String(Math.round(lb.acs)) : "—"} tone="amber" />
              <Tile label="K/D" value={lb.kd?.toFixed(2) ?? "—"} tone="dim" />
              <Tile label="KAST" value={lb.kast != null ? `${Math.round(lb.kast)}%` : "—"} tone="amber" />
              <Tile label="ADR" value={lb.adr != null ? String(Math.round(lb.adr)) : "—"} tone="dim" />
              <Tile label="Clutch" value={lb.clutchPct != null ? `${Math.round(lb.clutchPct)}%` : "—"} />
            </div>
          ) : (
            <p className="font-mono text-[10.5px] text-slate-500 py-3">
              Not on the current stats leaderboard.
            </p>
          )}
          {lb?.rounds != null && (
            <p className="font-mono text-[9px] text-slate-600 mt-2.5">over {lb.rounds} rounds</p>
          )}
        </div>
      </div>

      {/* Per-agent stats */}
      <div className="power-on sol-span-2" style={{ ["--i" as string]: 2 }}>
        <div className="hud-panel p-4">
          <div className="flex items-baseline justify-between gap-3 mb-3 pb-2 border-b border-cyan-500/15">
            <span className="font-display text-[12px] font-semibold uppercase tracking-[0.3em] hud-glow-text">
              Agent breakdown
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">
              career
            </span>
          </div>
          {data.agents.length === 0 ? (
            <p className="font-mono text-[10.5px] text-slate-500 py-2">No agent stats listed for this player.</p>
          ) : (
            <div className="flex flex-col">
              <div className="flex items-center gap-2 pb-1.5 font-mono text-[8.5px] uppercase tracking-[0.18em] text-slate-600">
                <span className="flex-1">Agent</span>
                <span className="w-16 text-right">Use</span>
                <span className="w-12 text-right">R</span>
                <span className="w-14 text-right">ACS</span>
                <span className="w-12 text-right">K:D</span>
                <span className="w-12 text-right">KAST</span>
                <span className="w-14 text-right hidden sm:block">ADR</span>
                <span className="w-14 text-right hidden sm:block">Rnds</span>
              </div>
              {data.agents.map((a) => (
                <div key={a.agent} className="flex items-center gap-2 py-1.5 border-b border-cyan-500/5">
                  <span className="flex-1 font-mono text-[12px] text-cyan-200 truncate capitalize">{a.agent}</span>
                  <span className="w-16 text-right font-mono text-[10px] text-slate-500 truncate">{a.use ?? "—"}</span>
                  <span className="w-12 text-right font-mono text-[11.5px] hud-glow-text tabular-nums">{a.rating ?? "—"}</span>
                  <span className="w-14 text-right font-mono text-[11px] text-amber-300/90 tabular-nums">{a.acs ?? "—"}</span>
                  <span className="w-12 text-right font-mono text-[11px] text-slate-300 tabular-nums">{a.kd ?? "—"}</span>
                  <span className="w-12 text-right font-mono text-[11px] text-slate-300 tabular-nums">{a.kast ?? "—"}</span>
                  <span className="w-14 text-right font-mono text-[11px] text-slate-400 tabular-nums hidden sm:block">{a.adr ?? "—"}</span>
                  <span className="w-14 text-right font-mono text-[10px] text-slate-600 tabular-nums hidden sm:block">{a.rounds ?? "—"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Header block — kept here so the page shell stays a thin server component. */
export function PlayerHeader({ id }: { id: string }) {
  const { data } = useWidgetData<EsportsPlayerData>(`/api/widgets/esports/player/${id}`, 120000);
  return (
    <div className="min-w-0">
      <h1 className="hud-title font-display text-base sm:text-lg font-semibold uppercase text-cyan-200 leading-none truncate">
        {data?.alias ?? "Player"}
      </h1>
      <p className="font-mono text-[8.5px] uppercase tracking-[0.32em] text-cyan-500/40 mt-1.5 truncate">
        {data
          ? [data.realName, data.team ? `team ${data.team}` : null, data.country?.toUpperCase()]
              .filter(Boolean).join(" · ") || `id ${data.id}`
          : "loading…"}
      </p>
    </div>
  );
}

/** Back link, client-side like /sol's. */
export function BackLink() {
  return (
    <Link href="/" className="cmd-chip shrink-0" aria-label="Back to dashboard">
      ← Dashboard
    </Link>
  );
}
