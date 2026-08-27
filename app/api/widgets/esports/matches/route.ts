import { NextResponse } from "next/server";
import type { WidgetResponse } from "@/components/widgets/types";
import { hasVlrConfig, normalizeMatch, unwrap, vlr, type Match, type VlrMatch } from "@/lib/vlr";
import { esportsEnabled } from "@/lib/features";

// vlr-api lives on another box and can vanish; this route always resolves.
export const dynamic = "force-dynamic";

export interface EsportsMatchesData {
  live: Match[];
  upcoming: Match[];
}

const EMPTY: EsportsMatchesData = { live: [], upcoming: [] };

function fail(): NextResponse {
  return NextResponse.json({
    status: "error",
    updatedAt: new Date().toISOString(),
    data: EMPTY
  } satisfies WidgetResponse<EsportsMatchesData>);
}

export async function GET() {
  // Not part of this instance when ENABLE_ESPORTS is off: 404 rather than a
  // degraded widget payload, so nothing here ever reaches vlr-api.
  if (!esportsEnabled()) return NextResponse.json({ error: "esports disabled" }, { status: 404 });

  if (!hasVlrConfig()) return fail();

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
