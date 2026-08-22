"use client";

import Link from "next/link";
import { useWidgetData } from "@/lib/fetcher";
import type { EsportsStatsData } from "@/app/api/widgets/esports/stats/route";
import FeedOffline from "./feed-offline";

/**
 * Player leaderboard ranked by R2.0 — VLR's COMPOSITE rating (it folds in
 * damage, survival, trades and impact). Explicitly not K/D, which is shown
 * beside it as its own column.
 */
export default function EsportsStats() {
  const { data, status, error } = useWidgetData<EsportsStatsData>(
    "/api/widgets/esports/stats",
    300000
  );

  if (error || status === "error") return <FeedOffline label="Player stats" />;
  if (!data)
    return (
      <div className="hud-panel p-4">
        <p className="font-mono text-[11px] hud-glow-text live-pulse">LOADING LEADERBOARD…</p>
      </div>
    );

  // Compact: top 5 fits the column without turning into a tall slab.
  const players = data.players.slice(0, 5);

  return (
    <div className="hud-panel p-3.5 h-full">
      <div className="flex items-center justify-between mb-1 pb-2 border-b border-cyan-500/15">
        <span className="font-display text-[12px] font-semibold uppercase tracking-[0.3em] hud-glow-text">
          R2.0 Leaderboard
        </span>
        {data.stale && (
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-amber-300/80">
            cached
          </span>
        )}
      </div>
      <p className="font-mono text-[8.5px] uppercase tracking-[0.18em] text-slate-500 mb-2.5">
        R2.0 = composite rating, not K/D
      </p>

      {players.length === 0 ? (
        <p className="font-mono text-[11px] text-slate-500 py-3">No player data.</p>
      ) : (
        <div className="flex flex-col">
          {/* Narrow column: R2.0 plus K/D only — enough to show they differ,
              without the ACS/KAST columns overflowing. */}
          <div className="flex items-center gap-2 pb-1.5 font-mono text-[8.5px] uppercase tracking-[0.18em] text-slate-600">
            <span className="w-4 shrink-0">#</span>
            <span className="flex-1">Player</span>
            <span className="w-11 text-right">R2.0</span>
            <span className="w-10 text-right">K/D</span>
          </div>

          {players.map((p, i) => {
            const row = (
            <div
              key={`${p.playerId ?? p.player}-${i}`}
              className={`flex items-center gap-2 py-1.5 border-b border-cyan-500/5 ${p.playerId ? "player-row" : ""}`}
            >
              <span className={`font-mono text-[11px] tabular-nums w-4 shrink-0 ${i < 3 ? "hud-glow-text" : "text-slate-500"}`}>
                {i + 1}
              </span>
              <span className="flex-1 min-w-0 flex items-baseline gap-2">
                <span className="font-mono text-[12.5px] text-slate-100 truncate">{p.player}</span>
                {/* team is populated on only ~15% of rows */}
                {p.team && (
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-cyan-500/50 truncate">
                    {p.team}
                  </span>
                )}
              </span>
              <span
                className={`font-mono text-[12px] tabular-nums w-11 text-right font-bold ${
                  i < 3 ? "text-cyan-300" : "text-slate-200"
                }`}
                style={i < 3 ? { textShadow: "0 0 8px rgba(34,211,238,0.4)" } : undefined}
              >
                {p.r2?.toFixed(2) ?? "—"}
              </span>
              <span className="font-mono text-[11px] tabular-nums w-10 text-right text-slate-400">
                {p.kd?.toFixed(2) ?? "—"}
              </span>
            </div>
            );
            // Rows carry player_id straight from the feed, so no search hop.
            return p.playerId ? (
              <Link key={`${p.playerId}-${i}`} href={`/esports/player/${p.playerId}`}
                    className="block" aria-label={`Open ${p.player} detail`}>
                {row}
              </Link>
            ) : row;
          })}
        </div>
      )}
    </div>
  );
}
