import { NextResponse } from "next/server";
import type { WidgetResponse } from "@/components/widgets/types";
// Shaping lives in lib/esports.ts, shared with the assistant's context
// snapshot, which calls it rather than fetching this route over loopback
// (a self-fetch carries no Access JWT and is 401'd by the auth layer).
import { EMPTY_RANKINGS, fetchEsportsRankings, type EsportsRankingsData } from "@/lib/esports";
import { hasVlrConfig } from "@/lib/vlr";
import { esportsEnabled } from "@/lib/features";
import { UPSTREAM_UNAVAILABLE, esportsGate } from "@/lib/response-status";

export const dynamic = "force-dynamic";

// The panels import these types from the route, as they do for every widget.
export type { RankedTeam, EsportsRankingsData } from "@/lib/esports";

// vlr-api is this route's only source, so a failed call leaves nothing to
// render: 503, with the WidgetResponse body kept so the panel still shows its
// own "feed offline" state. The ENABLE_ESPORTS 404 above is separate — that is
// "not part of this instance", not a failure.
const unavailable = () =>
  NextResponse.json(
    { status: "error", updatedAt: new Date().toISOString(), data: EMPTY_RANKINGS } satisfies WidgetResponse<EsportsRankingsData>,
    { status: UPSTREAM_UNAVAILABLE }
  );

export async function GET() {
  // One gate, two different meanings: esports switched off, or switched on but
  // with no VLR_API_URL yet. Both are "not part of this instance" (404), not a
  // failure — a 503 is reserved for a vlr-api that IS configured and is down.
  const gate = esportsGate(esportsEnabled(), hasVlrConfig());
  if (!gate.ready) return NextResponse.json({ error: gate.error }, { status: gate.status });
  try {
    return NextResponse.json({
      status: "ok",
      updatedAt: new Date().toISOString(),
      data: await fetchEsportsRankings()
    } satisfies WidgetResponse<EsportsRankingsData>);
  } catch (err) {
    console.error("esports rankings fetch failed:", err instanceof Error ? err.message : err);
    return unavailable();
  }
}
