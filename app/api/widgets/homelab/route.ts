import { NextResponse } from "next/server";
import type { WidgetResponse } from "@/components/widgets/types";
// The https-module PVE client now lives in lib/pve.ts so the detail route can
// share it. Same mechanism as before — still NOT fetch/undici (CLAUDE.md rule 1).
import { hasPveCredentials, pve } from "@/lib/pve";
import { UPSTREAM_UNAVAILABLE } from "@/lib/response-status";

// Without this Next prerenders this GET at build time and the panel serves
// frozen build-time telemetry forever.
export const dynamic = "force-dynamic";

export interface HomelabData {
  nodes: { name: string; online: boolean; cpuPct: number; ramUsedGb: number; ramTotalGb: number }[];
  guests: { vmid: number; name: string; type: "lxc" | "qemu"; status: "ok" | "error"; cpuPct: number; memPct: number }[];
}

// Proxmox is this route's ONLY source: if that call fails there is no partial
// answer to give, so the whole response is a failure and says so with a 503.
// The body keeps its WidgetResponse shape so the panel still renders its own
// "telemetry unavailable" state rather than a bare error.
const unavailable = () =>
  NextResponse.json(
    { status: "error", updatedAt: new Date().toISOString(), data: { nodes: [], guests: [] } } satisfies WidgetResponse<HomelabData>,
    { status: UPSTREAM_UNAVAILABLE }
  );

export async function GET() {
  if (!hasPveCredentials()) return unavailable();
  try {
    const resources = await pve("/cluster/resources");
    const nodes: HomelabData["nodes"] = resources
      .filter((r: { type: string }) => r.type === "node")
      .map((n: { node: string; status: string; cpu: number; mem: number; maxmem: number }) => ({
        name: n.node,
        online: n.status === "online",
        cpuPct: Math.round((n.cpu ?? 0) * 100),
        ramUsedGb: +(n.mem / 1024 ** 3).toFixed(1),
        ramTotalGb: +(n.maxmem / 1024 ** 3).toFixed(1)
      }));
    const guests: HomelabData["guests"] = resources
      .filter((r: { type: string }) => r.type === "lxc" || r.type === "qemu")
      .map((g: { vmid: number; name?: string; type: string; status: string; cpu: number; mem: number; maxmem: number }) => ({
        vmid: g.vmid,
        name: g.name ?? `guest-${g.vmid}`,
        type: g.type as "lxc" | "qemu",
        status: g.status === "running" ? "ok" : "error",
        cpuPct: Math.round((g.cpu ?? 0) * 100),
        memPct: g.maxmem ? Math.round((g.mem / g.maxmem) * 100) : 0
      }))
      .sort((a: { vmid: number }, b: { vmid: number }) => a.vmid - b.vmid);
    return NextResponse.json({ status: "ok", updatedAt: new Date().toISOString(), data: { nodes, guests } } satisfies WidgetResponse<HomelabData>);
  } catch (err) {
    console.error("homelab PVE fetch failed:", err instanceof Error ? err.message : err);
    return unavailable();
  }
}
