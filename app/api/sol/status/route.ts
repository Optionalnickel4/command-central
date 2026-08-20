import { NextResponse } from "next/server";
import type { WidgetResponse } from "@/components/widgets/types";
import { ccStats, stripPaths } from "@/lib/sol";

export const dynamic = "force-dynamic";

export interface SolStatusData {
  runtimeVersion: string;
  updateChannel: string | null;
  defaultAgentId: string | null;
  heartbeat: { agentId: string; enabled: boolean; every: string; everyMs: number }[];
  tasks: {
    total: number; active: number; terminal: number; failures: number;
    byStatus: Record<string, number>;
    byRuntime: Record<string, number>;
  };
  taskAudit: { total: number; warnings: number; errors: number; byCode: Record<string, number> };
  sessions: { count: number; defaultModel: string | null; defaultContextTokens: number | null };
  os: { platform: string; arch: string; release: string; label: string } | null;
  memoryPlugin: { enabled: boolean; slot: string | null } | null;
  /** Loopback URL deliberately omitted — mode/reachability is the useful part. */
  gateway: { mode: string | null; reachable: boolean | null; connectLatencyMs: number | null; error: string | null } | null;
  channelCount: number;
  queuedSystemEvents: number;
}

const EMPTY: SolStatusData = {
  runtimeVersion: "", updateChannel: null, defaultAgentId: null, heartbeat: [],
  tasks: { total: 0, active: 0, terminal: 0, failures: 0, byStatus: {}, byRuntime: {} },
  taskAudit: { total: 0, warnings: 0, errors: 0, byCode: {} },
  sessions: { count: 0, defaultModel: null, defaultContextTokens: null },
  os: null, memoryPlugin: null, gateway: null, channelCount: 0, queuedSystemEvents: 0
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export async function GET() {
  try {
    const raw = await ccStats("status", 25000);
    const d = stripPaths(JSON.parse(raw)) as any;

    const data: SolStatusData = {
      runtimeVersion: d.runtimeVersion ?? "",
      updateChannel: d.updateChannel ?? null,
      defaultAgentId: d.heartbeat?.defaultAgentId ?? null,
      heartbeat: (d.heartbeat?.agents ?? []).map((a: any) => ({
        agentId: a.agentId ?? "?",
        enabled: Boolean(a.enabled),
        every: a.every ?? "",
        everyMs: num(a.everyMs)
      })),
      tasks: {
        total: num(d.tasks?.total),
        active: num(d.tasks?.active),
        terminal: num(d.tasks?.terminal),
        failures: num(d.tasks?.failures),
        byStatus: d.tasks?.byStatus ?? {},
        byRuntime: d.tasks?.byRuntime ?? {}
      },
      taskAudit: {
        total: num(d.taskAudit?.total),
        warnings: num(d.taskAudit?.warnings),
        errors: num(d.taskAudit?.errors),
        byCode: d.taskAudit?.byCode ?? {}
      },
      sessions: {
        count: num(d.sessions?.count),
        defaultModel: d.sessions?.defaults?.model ?? null,
        defaultContextTokens: d.sessions?.defaults?.contextTokens ?? null
      },
      os: d.os ? {
        platform: d.os.platform ?? "", arch: d.os.arch ?? "",
        release: d.os.release ?? "", label: d.os.label ?? ""
      } : null,
      memoryPlugin: d.memoryPlugin
        ? { enabled: Boolean(d.memoryPlugin.enabled), slot: d.memoryPlugin.slot ?? null }
        : null,
      gateway: d.gateway ? {
        mode: d.gateway.mode ?? null,
        reachable: typeof d.gateway.reachable === "boolean" ? d.gateway.reachable : null,
        connectLatencyMs: typeof d.gateway.connectLatencyMs === "number" ? d.gateway.connectLatencyMs : null,
        error: d.gateway.error ?? null
      } : null,
      channelCount: Array.isArray(d.channelSummary) ? d.channelSummary.length : 0,
      queuedSystemEvents: Array.isArray(d.queuedSystemEvents) ? d.queuedSystemEvents.length : 0
    };

    return NextResponse.json({
      status: "ok", updatedAt: new Date().toISOString(), data
    } satisfies WidgetResponse<SolStatusData>);
  } catch (err) {
    console.error("sol status failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({
      status: "error", updatedAt: new Date().toISOString(), data: EMPTY
    } satisfies WidgetResponse<SolStatusData>);
  }
}
