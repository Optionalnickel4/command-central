/**
 * The esports panels' data layer: the vlr-api reads, shaped.
 *
 * Extracted from the routes so the assistant's context snapshot can call these
 * directly. It used to fetch /api/widgets/esports/* over loopback, which the
 * auth layer 401s — a server calling itself carries no Access JWT. A function
 * call never becomes a request, so the gate never applies to it.
 *
 * Both functions throw on failure; the route turns that into a 503 and the
 * snapshot degrades that slice to "unavailable". Neither reads env: the
 * ENABLE_ESPORTS / VLR_API_URL gate stays with the caller (esportsGate), so
 * there is still exactly one place that decides what "not configured" means.
 */

import { normalizeMatch, unwrap, vlr, type Match, type VlrMatch } from "@/lib/vlr";

export interface EsportsMatchesData {
  live: Match[];
  upcoming: Match[];
}

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

export const EMPTY_MATCHES: EsportsMatchesData = { live: [], upcoming: [] };
export const EMPTY_RANKINGS: EsportsRankingsData = { teams: [], blockCount: 0 };

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

export async function fetchEsportsMatches(): Promise<EsportsMatchesData> {
  // Upcoming is always fetched: it's the fallback hero when nothing is live.
  const [liveRaw, upcomingRaw] = await Promise.all([
    vlr<unknown>("/matches/live"),
    vlr<unknown>("/matches/upcoming")
  ]);

  return {
    live: unwrap<VlrMatch>(liveRaw).map(normalizeMatch),
    upcoming: unwrap<VlrMatch>(upcomingRaw).map(normalizeMatch).slice(0, 12)
  };
}

export async function fetchEsportsRankings(): Promise<EsportsRankingsData> {
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
  return { teams: (blocks[0] ?? []).slice(0, 12), blockCount: blocks.length };
}
