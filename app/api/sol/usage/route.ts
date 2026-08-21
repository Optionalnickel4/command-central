import { NextResponse } from "next/server";
import type { WidgetResponse } from "@/components/widgets/types";
import { readTurns, USAGE_LIMITS, type UsageTurn } from "@/lib/usage-log";

export const dynamic = "force-dynamic";

export interface SolUsageData {
  turns: UsageTurn[];
  totals: {
    turns: number;
    solTurns: number;
    input: number;
    output: number;
    total: number;
    cacheRead: number;
    failures: number;
  };
  /** Averages across turns that actually reported numbers. */
  averages: { durationMs: number | null; totalTokens: number | null; cacheHitPct: number | null };
  latest: UsageTurn | null;
  cap: number;
}

const EMPTY: SolUsageData = {
  turns: [],
  totals: { turns: 0, solTurns: 0, input: 0, output: 0, total: 0, cacheRead: 0, failures: 0 },
  averages: { durationMs: null, totalTokens: null, cacheHitPct: null },
  latest: null,
  cap: USAGE_LIMITS.MAX_TURNS
};

const sum = (rows: UsageTurn[], pick: (t: UsageTurn) => number | null) =>
  rows.reduce((a, t) => a + (pick(t) ?? 0), 0);

const avg = (rows: UsageTurn[], pick: (t: UsageTurn) => number | null): number | null => {
  const vals = rows.map(pick).filter((v): v is number => v != null);
  return vals.length ? vals.reduce((a, v) => a + v, 0) / vals.length : null;
};

export async function GET() {
  try {
    const turns = await readTurns();
    const sol = turns.filter((t) => t.backend === "sol");

    const cacheRead = sum(sol, (t) => t.cacheRead);
    const totalTokens = sum(sol, (t) => t.totalTokens);

    const data: SolUsageData = {
      turns,
      totals: {
        turns: turns.length,
        solTurns: sol.length,
        input: sum(sol, (t) => t.inputTokens),
        output: sum(sol, (t) => t.outputTokens),
        total: totalTokens,
        cacheRead,
        failures: turns.filter((t) => !t.ok).length
      },
      averages: {
        durationMs: avg(turns, (t) => t.durationMs),
        totalTokens: avg(sol, (t) => t.totalTokens),
        // Share of billed input that came from cache rather than fresh prompt.
        cacheHitPct: totalTokens > 0 ? (cacheRead / totalTokens) * 100 : null
      },
      latest: turns.length ? turns[turns.length - 1] : null,
      cap: USAGE_LIMITS.MAX_TURNS
    };

    return NextResponse.json({
      status: "ok", updatedAt: new Date().toISOString(), data
    } satisfies WidgetResponse<SolUsageData>);
  } catch (err) {
    console.error("sol usage failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({
      status: "error", updatedAt: new Date().toISOString(), data: EMPTY
    } satisfies WidgetResponse<SolUsageData>);
  }
}
