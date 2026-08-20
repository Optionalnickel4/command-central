"use client";

import { useWidgetData } from "@/lib/fetcher";
import type { EsportsMatchesData } from "@/app/api/widgets/esports/matches/route";
import type { Match } from "@/lib/vlr";
import FeedOffline from "./feed-offline";

/**
 * Compact match panel for the right column: ONE featured tile — the live
 * match if there is one, otherwise the next upcoming with its countdown —
 * plus a couple of short "on deck" rows. Column-width density, not a
 * stadium scoreboard.
 */

function TeamLine({ name, score, leading }: { name: string; score: number | null; leading: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 min-w-0">
      <span
        className={`font-display text-[15px] uppercase tracking-[0.06em] truncate ${
          leading ? "text-cyan-100" : "text-slate-300"
        }`}
        style={leading ? { textShadow: "0 0 10px rgba(34,211,238,0.45)" } : undefined}
      >
        {name}
      </span>
      <span
        className={`font-mono text-xl font-bold tabular-nums shrink-0 ${
          score == null ? "text-slate-600" : leading ? "hud-glow-text" : "text-slate-400"
        }`}
      >
        {score == null ? "–" : score}
      </span>
    </div>
  );
}

function FeaturedTile({ match, live }: { match: Match; live: boolean }) {
  const leadA = match.scoreA != null && match.scoreB != null && match.scoreA > match.scoreB;
  const leadB = match.scoreA != null && match.scoreB != null && match.scoreB > match.scoreA;

  return (
    <div className={`score-tile rounded border border-cyan-500/15 bg-slate-950/30 p-2.5 ${live ? "is-live" : ""}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="font-mono text-[8.5px] uppercase tracking-[0.18em] text-cyan-500/60 truncate">
          {match.event ?? "—"}
        </span>
        {live ? (
          <span className="flex items-center gap-1.5 shrink-0">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full bg-rose-500 live-pulse"
              style={{ boxShadow: "0 0 7px #f43f5e" }}
            />
            <span className="font-mono text-[8.5px] uppercase tracking-[0.22em] hud-glow-red">Live</span>
          </span>
        ) : (
          <span className="font-mono text-[8.5px] uppercase tracking-[0.18em] text-amber-300/80 shrink-0">
            {match.eta ? `in ${match.eta}` : match.time ?? "TBD"}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <TeamLine name={match.teamA} score={match.scoreA} leading={leadA} />
        <TeamLine name={match.teamB} score={match.scoreB} leading={leadB} />
      </div>

      {match.series && (
        <p className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-slate-500 mt-2 pt-1.5 border-t border-cyan-500/10 truncate">
          {match.series}
        </p>
      )}
    </div>
  );
}

export default function EsportsScoreboard() {
  const { data, status, error } = useWidgetData<EsportsMatchesData>(
    "/api/widgets/esports/matches",
    30000
  );

  if (error || status === "error") return <FeedOffline label="Match feed" />;
  if (!data)
    return (
      <div className="hud-panel p-3.5">
        <p className="font-mono text-[11px] hud-glow-text live-pulse">ACQUIRING MATCH FEED…</p>
      </div>
    );

  const hasLive = data.live.length > 0;
  const featured = hasLive ? data.live[0] : data.upcoming[0];
  // When something is live, the remaining live matches matter more than the
  // schedule; otherwise show what's next.
  const onDeck = (hasLive ? [...data.live.slice(1), ...data.upcoming] : data.upcoming.slice(1)).slice(0, 3);

  return (
    <div className="hud-panel p-3.5 h-full">
      <div className="flex items-center justify-between mb-2.5">
        <span className="font-display text-[11px] font-semibold uppercase tracking-[0.28em] hud-glow-text">
          {hasLive ? "Live Now" : "Next Up"}
        </span>
        {hasLive && data.live.length > 1 && (
          <span className="font-mono text-[8.5px] uppercase tracking-[0.2em] text-slate-500">
            +{data.live.length - 1} more live
          </span>
        )}
      </div>

      {!featured ? (
        <p className="font-mono text-[11px] text-slate-500 py-3">No matches on the feed.</p>
      ) : (
        <>
          <FeaturedTile match={featured} live={hasLive} />

          {onDeck.length > 0 && (
            <div className="mt-2.5 pt-2 border-t border-cyan-500/10 flex flex-col gap-1">
              {onDeck.map((m) => (
                <div key={m.id} className="flex items-center gap-2 min-w-0 font-mono text-[11px]">
                  <span className="text-amber-300/70 tabular-nums w-14 shrink-0 text-[10px]">
                    {m.eta ? `+${m.eta}` : m.time ?? "—"}
                  </span>
                  <span className="truncate text-slate-300 min-w-0">{m.teamA}</span>
                  <span className="text-cyan-500/40 shrink-0">v</span>
                  <span className="truncate text-slate-300 min-w-0">{m.teamB}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
