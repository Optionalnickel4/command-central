import { NextResponse } from "next/server";
import type { WidgetResponse } from "@/components/widgets/types";
import { ccStats, stripPaths } from "@/lib/sol";

export const dynamic = "force-dynamic";

export interface SolAuditEvent {
  eventId: string;
  sequence: number | null;
  occurredAt: number | null;
  kind: string | null;
  action: string | null;
  status: string | null;
  errorCode: string | null;
  agentId: string | null;
  sessionId: string | null;
  runId: string | null;
}

export interface SolAuditData {
  events: SolAuditEvent[];
  byStatus: Record<string, number>;
  byAction: Record<string, number>;
  byErrorCode: Record<string, number>;
  /** Runs bucketed by hour for the activity timeline. */
  timeline: { hour: number; started: number; succeeded: number; failed: number; blocked: number }[];
  windowStart: number | null;
  windowEnd: number | null;
}

const EMPTY: SolAuditData = {
  events: [], byStatus: {}, byAction: {}, byErrorCode: {},
  timeline: [], windowStart: null, windowEnd: null
};

export async function GET() {
  try {
    // Events are metadata only ("redaction":"metadata_only") — no message
    // bodies are present, and none are forwarded.
    const raw = await ccStats("audit", 45000);
    const d = stripPaths(JSON.parse(raw)) as any;
    const rows: any[] = Array.isArray(d.events) ? d.events : [];

    const events: SolAuditEvent[] = rows.map((e) => ({
      eventId: e.eventId ?? "",
      sequence: typeof e.sequence === "number" ? e.sequence : null,
      occurredAt: typeof e.occurredAt === "number" ? e.occurredAt : null,
      kind: e.kind ?? null,
      action: e.action ?? null,
      status: e.status ?? null,
      errorCode: e.errorCode ?? null,
      agentId: e.agentId ?? null,
      sessionId: e.sessionId ?? null,
      runId: e.runId ?? null
    })).sort((a, b) => (b.occurredAt ?? 0) - (a.occurredAt ?? 0));

    const tally = (pick: (e: SolAuditEvent) => string | null) =>
      events.reduce<Record<string, number>>((acc, e) => {
        const k = pick(e);
        if (!k) return acc;
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {});

    const stamps = events.map((e) => e.occurredAt).filter((t): t is number => t != null);
    const buckets = new Map<number, { started: number; succeeded: number; failed: number; blocked: number }>();
    for (const e of events) {
      if (e.occurredAt == null) continue;
      const hour = Math.floor(e.occurredAt / 3600000) * 3600000;
      const b = buckets.get(hour) ?? { started: 0, succeeded: 0, failed: 0, blocked: 0 };
      if (e.status && e.status in b) (b as any)[e.status] += 1;
      buckets.set(hour, b);
    }

    const data: SolAuditData = {
      events: events.slice(0, 60),
      byStatus: tally((e) => e.status),
      byAction: tally((e) => e.action),
      byErrorCode: tally((e) => e.errorCode),
      timeline: [...buckets.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([hour, v]) => ({ hour, ...v })),
      windowStart: stamps.length ? Math.min(...stamps) : null,
      windowEnd: stamps.length ? Math.max(...stamps) : null
    };

    return NextResponse.json({
      status: "ok", updatedAt: new Date().toISOString(), data
    } satisfies WidgetResponse<SolAuditData>);
  } catch (err) {
    console.error("sol audit failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({
      status: "error", updatedAt: new Date().toISOString(), data: EMPTY
    } satisfies WidgetResponse<SolAuditData>);
  }
}
