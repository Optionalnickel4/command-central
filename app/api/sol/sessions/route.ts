import { NextResponse } from "next/server";
import type { WidgetResponse } from "@/components/widgets/types";
import { UPSTREAM_UNAVAILABLE } from "@/lib/response-status";
import { ccStats, stripPaths } from "@/lib/sol";

export const dynamic = "force-dynamic";

export interface SolSession {
  key: string;
  sessionId: string | null;
  agentId: string | null;
  kind: string | null;
  status: string | null;
  model: string | null;
  modelProvider: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  contextTokens: number | null;
  updatedAt: number | null;
  /** Session start, for ordering the historical usage series. */
  sessionStartedAt: number | null;
  ageMs: number | null;
  abortedLastRun: boolean;
}

export interface SolSessionsData {
  count: number;
  totalCount: number;
  totals: { input: number; output: number; total: number };
  byStatus: Record<string, number>;
  byKind: Record<string, number>;
  byModel: Record<string, number>;
  sessions: SolSession[];
}

const EMPTY: SolSessionsData = {
  count: 0, totalCount: 0, totals: { input: 0, output: 0, total: 0 },
  byStatus: {}, byKind: {}, byModel: {}, sessions: []
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const tally = (rows: unknown[], pick: (r: any) => string) =>
  rows.reduce<Record<string, number>>((acc, r) => {
    const k = pick(r);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

export async function GET() {
  try {
    // stripPaths removes each session's absolute .jsonl file path; the session
    // KEY and id are kept because they identify without leaking fs layout.
    const raw = await ccStats("sessions", 45000);
    const d = stripPaths(JSON.parse(raw)) as any;
    const rows: any[] = Array.isArray(d.sessions) ? d.sessions : [];

    const sessions: SolSession[] = rows.map((s) => ({
      key: s.key ?? "",
      sessionId: s.sessionId ?? null,
      agentId: s.agentId ?? null,
      kind: s.kind ?? null,
      status: s.status ?? null,
      model: s.model ?? null,
      modelProvider: s.modelProvider ?? null,
      inputTokens: num(s.inputTokens),
      outputTokens: num(s.outputTokens),
      totalTokens: num(s.totalTokens),
      contextTokens: typeof s.contextTokens === "number" ? s.contextTokens : null,
      updatedAt: typeof s.updatedAt === "number" ? s.updatedAt : null,
      sessionStartedAt: typeof s.sessionStartedAt === "number" ? s.sessionStartedAt : null,
      ageMs: typeof s.ageMs === "number" ? s.ageMs : null,
      abortedLastRun: Boolean(s.abortedLastRun)
    })).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

    const data: SolSessionsData = {
      count: num(d.count) || sessions.length,
      totalCount: num(d.totalCount) || sessions.length,
      totals: {
        input: sessions.reduce((a, s) => a + s.inputTokens, 0),
        output: sessions.reduce((a, s) => a + s.outputTokens, 0),
        total: sessions.reduce((a, s) => a + s.totalTokens, 0)
      },
      // Sessions that never ran report no status; label rather than drop them.
      byStatus: tally(sessions, (s) => s.status ?? "idle"),
      byKind: tally(sessions, (s) => s.kind ?? "unknown"),
      byModel: tally(sessions, (s) => s.model ?? "unknown"),
      sessions
    };

    return NextResponse.json({
      status: "ok", updatedAt: new Date().toISOString(), data
    } satisfies WidgetResponse<SolSessionsData>);
  } catch (err) {
    console.error("sol sessions failed:", err instanceof Error ? err.message : err);
    // cc-stats on 152 is the only source here, so a failed call is a failed
    // response — 503, with the body shape kept so the panel degrades as before.
    return NextResponse.json(
      { status: "error", updatedAt: new Date().toISOString(), data: EMPTY } satisfies WidgetResponse<SolSessionsData>,
      { status: UPSTREAM_UNAVAILABLE }
    );
  }
}
