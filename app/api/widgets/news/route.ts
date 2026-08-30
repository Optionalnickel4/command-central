import { NextResponse } from "next/server";
import type { WidgetResponse } from "@/components/widgets/types";
import { fetchFeed, mergeHeadlines, newsFeeds, newsLimit, type Headline } from "@/lib/news";
import { UPSTREAM_UNAVAILABLE, aggregateStatus } from "@/lib/response-status";

// Keeps this route server-rendered per request; without it Next prerenders
// the GET at build time and the panel freezes on build-time data.
export const dynamic = "force-dynamic";

export interface NewsData {
  headlines: Headline[];
  /** How many of the configured feeds answered, for the panel's degraded note. */
  feedsOk: number;
  feedsTotal: number;
}

/**
 * RSS feeds don't want frequent polling and the panel doesn't need it — news
 * doesn't move on a 30-second timescale. Overridable so diagnostics don't have
 * to wait a quarter hour for a refresh.
 */
const TTL_MS = Number(process.env.NEWS_TTL_MS) > 0
  ? Number(process.env.NEWS_TTL_MS)
  : 15 * 60 * 1000;

let cache: { at: number; payload: WidgetResponse<NewsData> } | null = null;

export async function GET() {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json(cache.payload);
  }

  const feeds = newsFeeds();

  // Per-feed settle, the same discipline as the media aggregate: one publisher
  // 403ing or moving its feed must cost that feed's items and nothing else.
  const results = await Promise.allSettled(feeds.map((feed) => fetchFeed(feed)));

  const items: Headline[] = [];
  for (const [i, result] of results.entries()) {
    if (result.status === "fulfilled") {
      items.push(...result.value);
    } else {
      console.error(
        `news feed ${feeds[i].name} failed:`,
        result.reason instanceof Error ? result.reason.message : result.reason
      );
    }
  }

  const slices = results.map((r) => ({ ok: r.status === "fulfilled" }));
  const feedsOk = slices.filter((s) => s.ok).length;
  const httpStatus = aggregateStatus(slices);

  // Every feed down leaves nothing to render: 503, with the WidgetResponse body
  // kept so the panel shows its own "unavailable" state rather than a bare
  // transport error. One or two down is degradation — the design working — and
  // stays 200 so the surviving feeds still fill the panel.
  if (httpStatus === UPSTREAM_UNAVAILABLE) {
    return NextResponse.json(
      {
        status: "error",
        updatedAt: new Date().toISOString(),
        data: { headlines: [], feedsOk: 0, feedsTotal: feeds.length }
      } satisfies WidgetResponse<NewsData>,
      { status: UPSTREAM_UNAVAILABLE }
    );
  }

  const payload: WidgetResponse<NewsData> = {
    status: feedsOk === feeds.length ? "ok" : "degraded",
    updatedAt: new Date().toISOString(),
    data: {
      headlines: mergeHeadlines(items, newsLimit()),
      feedsOk,
      feedsTotal: feeds.length
    }
  };
  // Only cache a result worth reusing; a fully failed pass retries next poll.
  cache = { at: Date.now(), payload };
  return NextResponse.json(payload);
}
