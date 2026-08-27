import { NextResponse } from "next/server";
import type { WidgetResponse } from "@/components/widgets/types";
import { hasVlrConfig, unwrap, vlr } from "@/lib/vlr";
import { esportsEnabled } from "@/lib/features";
import { UPSTREAM_UNAVAILABLE, esportsGate } from "@/lib/response-status";

export const dynamic = "force-dynamic";

/**
 * Only the fields vlr-api actually populates: record/wins/losses/earnings come
 * back null on every row, so they are deliberately not surfaced.
 *
 * IMPORTANT: /rankings returns 13 concatenated per-region top-10 blocks with
 * NO region field — ranks 1-10 simply repeat 13 times, and the ?region= filter
 * only has data for "gc". So the raw `rank` is a REGIONAL position, not a world
 * one, and sorting by it would show several different "#1" teams. We rank by
 * rating instead and keep the regional position as a badge.
 */
export interface RankedTeam {
  rank: number;
  team: string;
  teamId: string | null;
  country: string | null;
  rating: number | null;
}

export interface EsportsRankingsData {
  teams: RankedTeam[];
  /** How many regional blocks the feed returned, for the UI's caveat line. */
  blockCount: number;
}

const EMPTY: EsportsRankingsData = { teams: [], blockCount: 0 };

interface RawRanking {
  rank?: string | number;
  team?: string;
  team_id?: string;
  country?: string | null;
  rating?: string | number | null;
}

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// vlr-api is this route's only source, so a failed call leaves nothing to
// render: 503, with the WidgetResponse body kept so the panel still shows its
// own "feed offline" state. The ENABLE_ESPORTS 404 above is separate — that is
// "not part of this instance", not a failure.
const unavailable = () =>
  NextResponse.json(
    { status: "error", updatedAt: new Date().toISOString(), data: EMPTY } satisfies WidgetResponse<EsportsRankingsData>,
    { status: UPSTREAM_UNAVAILABLE }
  );

export async function GET() {
  // One gate, two different meanings: esports switched off, or switched on but
  // with no VLR_API_URL yet. Both are "not part of this instance" (404), not a
  // failure — a 503 is reserved for a vlr-api that IS configured and is down.
  const gate = esportsGate(esportsEnabled(), hasVlrConfig());
  if (!gate.ready) return NextResponse.json({ error: gate.error }, { status: gate.status });
  try {
    const raw = await vlr<unknown>("/rankings");
    const rows = unwrap<RawRanking>(raw).map((r, i) => ({
      rank: toNum(r.rank) ?? i + 1,
      team: r.team ?? "Unknown",
      teamId: r.team_id ?? null,
      country: r.country ?? null,
      rating: toNum(r.rating)
    }));

    // Split the concatenated feed back into regional blocks: a new block
    // begins wherever the rank stops increasing.
    const blocks: RankedTeam[][] = [];
    for (const row of rows) {
      const current = blocks[blocks.length - 1];
      if (!current || row.rank <= current[current.length - 1].rank) blocks.push([row]);
      else current.push(row);
    }

    // Show ONE block. Every block's leader is normalised to exactly 2000, so a
    // rating-sorted list across blocks is all ties and conveys nothing; within
    // a block the ratings form a real ladder.
    const teams = (blocks[0] ?? []).slice(0, 12);

    return NextResponse.json({
      status: "ok",
      updatedAt: new Date().toISOString(),
      data: { teams, blockCount: blocks.length }
    } satisfies WidgetResponse<EsportsRankingsData>);
  } catch (err) {
    console.error("esports rankings fetch failed:", err instanceof Error ? err.message : err);
    return unavailable();
  }
}
