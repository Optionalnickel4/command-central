import { NextResponse } from "next/server";
import type { WidgetResponse } from "@/components/widgets/types";
import { hasVlrConfig, unwrap, vlr } from "@/lib/vlr";
import { esportsEnabled } from "@/lib/features";
import { UPSTREAM_UNAVAILABLE, esportsGate } from "@/lib/response-status";

export const dynamic = "force-dynamic";

/**
 * One player's profile + 4-axis dimensions + leaderboard line.
 *
 * Confirmed by curl against the live API:
 *  - /player/{id}              -> {id, alias, real_name, country, team, team_id, agent_stats[], matches[]}
 *  - /players/{id}/dimensions  -> {player_id, region, timespan, firepower, entry,
 *                                  consistency, clutch, low_confidence[]}
 *                                 …or {detail:"…not found in <region> leaderboard"}
 *  - /stats                    -> {data,stale,error} envelope; rows carry player_id
 *
 * The four dimension values are ALREADY percentiles (0-100) — sampled across six
 * players they spanned 1.8–94.1 — so the radar plots them directly against a
 * fixed 0-100 axis. No normalisation, and none invented.
 */

export interface PlayerAxis {
  key: string;
  label: string;
  value: number | null;
  lowConfidence: boolean;
}

export interface PlayerAgentStat {
  agent: string;
  rating: string | null;
  acs: string | null;
  kd: string | null;
  kast: string | null;
  adr: string | null;
  rounds: string | null;
  use: string | null;
}

export interface EsportsPlayerData {
  id: string;
  alias: string;
  realName: string | null;
  country: string | null;
  team: string | null;
  teamId: string | null;
  /** Null when the player isn't on a leaderboard — the page says so plainly. */
  axes: PlayerAxis[] | null;
  dimensionsNote: string | null;
  region: string | null;
  timespan: string | null;
  agents: PlayerAgentStat[];
  leaderboard: {
    r2: number | null; acs: number | null; kd: number | null;
    kast: number | null; adr: number | null; clutchPct: number | null; rounds: number | null;
  } | null;
}

const AXES: { key: string; label: string }[] = [
  { key: "firepower", label: "Firepower" },
  { key: "entry", label: "Entry" },
  { key: "consistency", label: "Consistency" },
  { key: "clutch", label: "Clutch" }
];

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const EMPTY = (id: string): EsportsPlayerData => ({
  id, alias: "Unknown", realName: null, country: null, team: null, teamId: null,
  axes: null, dimensionsNote: "Player data unavailable.", region: null, timespan: null,
  agents: [], leaderboard: null
});

// The PROFILE call is required; dimensions and the leaderboard row each degrade
// on their own and still return 200 with the profile. Only a failed profile (or
// no vlr-api at all, or an unusable id) leaves nothing to render — that is 503.
const unavailable = (id: string) =>
  NextResponse.json(
    { status: "error", updatedAt: new Date().toISOString(), data: EMPTY(id) } satisfies WidgetResponse<EsportsPlayerData>,
    { status: UPSTREAM_UNAVAILABLE }
  );

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  // One gate, two different meanings: esports switched off, or switched on but
  // with no VLR_API_URL yet. Both are "not part of this instance" (404), not a
  // failure — a 503 is reserved for a vlr-api that IS configured and is down.
  const gate = esportsGate(esportsEnabled(), hasVlrConfig());
  if (!gate.ready) return NextResponse.json({ error: gate.error }, { status: gate.status });

  // An id with no digits in it is a bad request, not a config or upstream
  // problem — unchanged from before this split.
  const id = String(ctx.params.id ?? "").replace(/\D/g, "");
  if (!id) return unavailable(id);

  try {
    // Each source degrades on its own: a missing leaderboard row or absent
    // dimensions must still render the profile.
    const [profile, dims, stats] = await Promise.all([
      vlr<any>(`/player/${id}`, 8000),
      vlr<any>(`/players/${id}/dimensions`, 8000).catch(() => null),
      vlr<any>("/stats", 8000).catch(() => null)
    ]);

    const hasDims = dims && typeof dims.firepower === "number";
    const lowConf: string[] = Array.isArray(dims?.low_confidence) ? dims.low_confidence : [];

    const axes: PlayerAxis[] | null = hasDims
      ? AXES.map((a) => ({
          key: a.key,
          label: a.label,
          value: num(dims[a.key]),
          lowConfidence: lowConf.includes(a.key)
        }))
      : null;

    const agents: PlayerAgentStat[] = (profile?.agent_stats ?? [])
      .slice(0, 8)
      .map((a: any) => ({
        agent: a.agent ?? "?",
        rating: str(a.stats?.R),
        acs: str(a.stats?.ACS),
        kd: str(a.stats?.["K:D"]),
        kast: str(a.stats?.KAST),
        adr: str(a.stats?.ADR),
        rounds: str(a.stats?.Rnd),
        use: str(a.stats?.Use)
      }));

    const row = unwrap<any>(stats).find((p) => String(p.player_id) === id) ?? null;

    const data: EsportsPlayerData = {
      id,
      alias: profile?.alias ?? `Player ${id}`,
      realName: str(profile?.real_name),
      country: str(profile?.country),
      team: str(profile?.team),
      teamId: profile?.team_id ? String(profile.team_id) : null,
      axes,
      dimensionsNote: hasDims ? null : str(dims?.detail) ?? "No dimensional data for this player.",
      region: str(dims?.region),
      timespan: str(dims?.timespan),
      agents,
      leaderboard: row
        ? {
            r2: num(row.r2), acs: num(row.acs), kd: num(row.kd), kast: num(row.kast),
            adr: num(row.adr), clutchPct: num(row.clutch_pct), rounds: num(row.rnd)
          }
        : null
    };

    return NextResponse.json({
      status: "ok", updatedAt: new Date().toISOString(), data
    } satisfies WidgetResponse<EsportsPlayerData>);
  } catch (err) {
    console.error("esports player fetch failed:", err instanceof Error ? err.message : err);
    return unavailable(id);
  }
}
