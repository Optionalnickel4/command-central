"use client";

import { useWidgetData } from "@/lib/fetcher";
import type { EsportsNewsData } from "@/app/api/widgets/esports/news/route";
import FeedOffline from "./feed-offline";

/**
 * Dedicated esports news ticker — deliberately separate from the system
 * vitals marquee at the base of the cockpit, and carrying the feed-status
 * dot sourced from vlr-api's own /status check.
 */
export default function EsportsNews() {
  const { data, status, error } = useWidgetData<EsportsNewsData>(
    "/api/widgets/esports/news",
    300000
  );

  if (error || status === "error") return <FeedOffline label="News feed" />;

  const headlines = data?.headlines ?? [];
  const line = headlines.map((h) => h.title).join("      ◆      ");

  return (
    <div className="hud-panel flex items-stretch overflow-hidden">
      <div className="flex items-center gap-2 px-3 border-r border-cyan-500/20 bg-cyan-500/5 shrink-0">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            data?.feedOk ? "bg-emerald-400 live-pulse" : "bg-amber-400"
          }`}
          style={{ boxShadow: data?.feedOk ? "0 0 6px #34d399" : "0 0 6px #fbbf24" }}
        />
        <span className="font-mono text-[9.5px] uppercase tracking-[0.3em] hud-glow-text">
          VLR Wire
        </span>
      </div>

      <div className="ticker-mask flex-1 overflow-hidden py-1.5 min-w-0">
        {headlines.length === 0 ? (
          <span className="px-4 font-mono text-[11px] text-slate-500">
            {data ? "No headlines on the wire." : "Loading headlines…"}
          </span>
        ) : (
          <div className="ticker-track ticker-slow font-mono text-[11px] tracking-wider text-cyan-400/70">
            <span className="px-4">{line}</span>
            <span className="px-4">{line}</span>
          </div>
        )}
      </div>
    </div>
  );
}
