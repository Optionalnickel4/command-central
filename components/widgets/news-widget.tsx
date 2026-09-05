"use client";

import { useWidgetData } from "@/lib/fetcher";
import type { NewsData } from "@/app/api/widgets/news/route";
import { PanelEmpty, PanelFailure, PanelFrame, PanelSkeleton, PanelTitle } from "./panel-state";

/**
 * Merged tech/gaming headlines. Feeds degrade individually, so the panel says
 * so quietly when some are missing rather than pretending the set is complete
 * — and only calls it unavailable when every feed is down.
 */
export default function NewsWidget() {
  const { data, status, error, updatedAt, freshness } = useWidgetData<NewsData>("/api/widgets/news", 15 * 60000);

  const failed = Boolean(error) || status === "error";
  const degraded = status === "degraded" && data;

  return (
    <PanelFrame>
      <PanelTitle state={failed ? (data ? "stale" : "down") : degraded ? "degraded" : freshness === "stale" ? "stale" : "healthy"} updatedAt={updatedAt}>Tech / Gaming
        {degraded && (
          <span
            title="Some feeds didn't answer; the rest are current"
            className="font-mono text-[8px] uppercase tracking-[0.2em] text-amber-400/50 shrink-0"
          >
            {data.feedsOk}/{data.feedsTotal} feeds
          </span>
        )}
      </PanelTitle>

      {failed && <PanelFailure source="news feeds" stale={Boolean(data)} />}
      {!failed && !data && <PanelSkeleton label="Loading news" />}

      {!failed &&
        data?.headlines.map((h) => (
          <a
            key={h.url}
            href={h.url}
            target="_blank"
            rel="noreferrer noopener"
            className="font-mono text-xs text-slate-300 mb-2 leading-relaxed flex gap-2 hover:text-cyan-300 transition-colors"
          >
            <span className="text-cyan-500/40 shrink-0">▸</span>
            <span className="min-w-0">
              {h.title}
              <span className="text-cyan-500/35"> · {h.source}</span>
            </span>
          </a>
        ))}

      {!failed && data?.headlines.length === 0 && (
        <PanelEmpty>No headlines on the wire.</PanelEmpty>
      )}
    </PanelFrame>
  );
}
