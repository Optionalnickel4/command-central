"use client";

import { useWidgetData } from "@/lib/fetcher";
import type { EsportsRankingsData } from "@/app/api/widgets/esports/rankings/route";
import FeedOffline from "./feed-offline";

/** Broadcast-style ranked table. Rating is VLR's team rating points. */
export default function EsportsRankings() {
  const { data, status, error } = useWidgetData<EsportsRankingsData>(
    "/api/widgets/esports/rankings",
    300000
  );

  if (error || status === "error") return <FeedOffline label="Rankings" />;
  if (!data)
    return (
      <div className="hud-panel p-4">
        <p className="font-mono text-[11px] hud-glow-text live-pulse">LOADING RANKINGS…</p>
      </div>
    );

  const top = data.teams[0]?.rating ?? 0;
  // Compact: the column has room for a top 5, not a full ladder.
  const teams = data.teams.slice(0, 5);

  return (
    <div className="hud-panel p-3.5 h-full">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-cyan-500/15">
        <span className="font-display text-[12px] font-semibold uppercase tracking-[0.3em] hud-glow-text">
          Top Teams
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-slate-500">
          Rating pts
        </span>
      </div>
      {/* vlr-api concatenates unlabelled regional blocks; we show the first,
          because every block's leader is normalised to 2000. */}
      <p className="font-mono text-[8.5px] uppercase tracking-[0.18em] text-slate-500 -mt-1 mb-2">
        Regional ladder{data.blockCount > 1 ? ` · 1 of ${data.blockCount} regions` : ""}
      </p>

      {teams.length === 0 ? (
        <p className="font-mono text-[11px] text-slate-500 py-3">No ranking data.</p>
      ) : (
        <div className="flex flex-col">
          {teams.map((t) => {
            const share = top > 0 && t.rating != null ? (t.rating / top) * 100 : 0;
            const podium = t.rank <= 3;
            return (
              <div
                key={t.teamId ?? t.team}
                className="relative flex items-center gap-3 py-1.5 border-b border-cyan-500/5 overflow-hidden"
              >
                {/* Rating bar as a subtle backdrop — broadcast standings feel */}
                <span
                  className="absolute inset-y-0 left-0 rank-bar"
                  style={{ width: `${share}%` }}
                  aria-hidden="true"
                />
                <span
                  className={`relative font-mono text-[11px] tabular-nums w-6 shrink-0 ${
                    podium ? "hud-glow-text" : "text-slate-500"
                  }`}
                >
                  {t.rank}
                </span>
                <span className="relative flex-1 min-w-0 font-display text-[13px] uppercase tracking-[0.06em] text-slate-200 truncate">
                  {t.team}
                </span>
                {/* Country is dropped in this half-column layout — team names
                    need the room more than the flag text does. */}
                <span
                  className={`relative font-mono text-[12px] tabular-nums shrink-0 w-12 text-right ${
                    podium ? "text-cyan-300" : "text-slate-300"
                  }`}
                >
                  {t.rating ?? "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
