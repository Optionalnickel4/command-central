import { NextResponse } from "next/server";
import type { WidgetResponse } from "@/components/widgets/types";
import { hasVlrConfig, isStale, unwrap, vlr } from "@/lib/vlr";
import { esportsEnabled } from "@/lib/features";
import { UPSTREAM_UNAVAILABLE, esportsGate } from "@/lib/response-status";

export const dynamic = "force-dynamic";

/**
 * Player leaderboard. r2 is VLR's R2.0 — a COMPOSITE performance rating,
 * not a K/D ratio; the UI labels it accordingly.
 */
export interface PlayerStat {
  player: string;
  playerId: string | null;
  team: string | null;
  r2: number | null;
  acs: number | null;
  kd: number | null;
  kast: number | null;
  adr: number | null;
  clutchPct: number | null;
  rounds: number | null;
}

export interface EsportsStatsData {
  players: PlayerStat[];
  /** vlr-api flags cache reads it knows are stale. */
  stale: boolean;
}

const EMPTY: EsportsStatsData = { players: [], stale: false };

interface RawStat {
  player?: string;
  player_id?: string;
  team?: string | null;
  r2?: number | null;
  acs?: number | null;
  kd?: number | null;
  kast?: number | null;
  adr?: number | null;
  clutch_pct?: number | null;
  rnd?: number | null;
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

// vlr-api is this route's only source, so a failed call leaves nothing to
// render: 503, with the WidgetResponse body kept so the panel still shows its
// own "feed offline" state. The ENABLE_ESPORTS 404 above is separate — that is
// "not part of this instance", not a failure.
const unavailable = () =>
  NextResponse.json(
    { status: "error", updatedAt: new Date().toISOString(), data: EMPTY } satisfies WidgetResponse<EsportsStatsData>,
    { status: UPSTREAM_UNAVAILABLE }
  );

export async function GET() {
  // One gate, two different meanings: esports switched off, or switched on but
  // with no VLR_API_URL yet. Both are "not part of this instance" (404), not a
  // failure — a 503 is reserved for a vlr-api that IS configured and is down.
  const gate = esportsGate(esportsEnabled(), hasVlrConfig());
  if (!gate.ready) return NextResponse.json({ error: gate.error }, { status: gate.status });
  try {
    const raw = await vlr<unknown>("/stats");
    const players = unwrap<RawStat>(raw)
      .map((p) => ({
        player: p.player ?? "Unknown",
        playerId: p.player_id ?? null,
        // Populated on only ~15% of rows — the UI must not assume a team.
        team: p.team ?? null,
        r2: num(p.r2),
        acs: num(p.acs),
        kd: num(p.kd),
        kast: num(p.kast),
        adr: num(p.adr),
        clutchPct: num(p.clutch_pct),
        rounds: num(p.rnd)
      }))
      .sort((a, b) => (b.r2 ?? 0) - (a.r2 ?? 0))
      .slice(0, 12);

    return NextResponse.json({
      status: "ok",
      updatedAt: new Date().toISOString(),
      data: { players, stale: isStale(raw) }
    } satisfies WidgetResponse<EsportsStatsData>);
  } catch (err) {
    console.error("esports stats fetch failed:", err instanceof Error ? err.message : err);
    return unavailable();
  }
}
