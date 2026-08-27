import { NextResponse } from "next/server";
import type { WidgetResponse } from "@/components/widgets/types";
import { hasVlrConfig, normalizeMatch, unwrap, vlr, type Match, type VlrMatch } from "@/lib/vlr";
import { esportsEnabled } from "@/lib/features";
import { UPSTREAM_UNAVAILABLE, esportsGate } from "@/lib/response-status";

// vlr-api lives on another box and can vanish; this route always resolves.
export const dynamic = "force-dynamic";

export interface EsportsMatchesData {
  live: Match[];
  upcoming: Match[];
}

const EMPTY: EsportsMatchesData = { live: [], upcoming: [] };

// vlr-api is this route's only source, so a failed call leaves nothing to
// render: 503, with the WidgetResponse body kept so the panel still shows its
// own "feed offline" state. The ENABLE_ESPORTS 404 above is separate — that is
// "not part of this instance", not a failure.
function fail(): NextResponse {
  return NextResponse.json(
    { status: "error", updatedAt: new Date().toISOString(), data: EMPTY } satisfies WidgetResponse<EsportsMatchesData>,
    { status: UPSTREAM_UNAVAILABLE }
  );
}

export async function GET() {
  // One gate, two different meanings: esports switched off, or switched on but
  // with no VLR_API_URL yet. Both are "not part of this instance" (404), not a
  // failure — a 503 is reserved for a vlr-api that IS configured and is down.
  const gate = esportsGate(esportsEnabled(), hasVlrConfig());
  if (!gate.ready) return NextResponse.json({ error: gate.error }, { status: gate.status });

  try {
    // Upcoming is always fetched: it's the fallback hero when nothing is live.
    const [liveRaw, upcomingRaw] = await Promise.all([
      vlr<unknown>("/matches/live"),
      vlr<unknown>("/matches/upcoming")
    ]);

    const live = unwrap<VlrMatch>(liveRaw).map(normalizeMatch);
    const upcoming = unwrap<VlrMatch>(upcomingRaw).map(normalizeMatch).slice(0, 12);

    return NextResponse.json({
      status: "ok",
      updatedAt: new Date().toISOString(),
      data: { live, upcoming }
    } satisfies WidgetResponse<EsportsMatchesData>);
  } catch (err) {
    console.error("esports matches fetch failed:", err instanceof Error ? err.message : err);
    return fail();
  }
}
