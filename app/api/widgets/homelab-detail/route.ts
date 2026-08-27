import { NextResponse } from "next/server";
import type { WidgetResponse } from "@/components/widgets/types";
import { hasPveCredentials, pve } from "@/lib/pve";
import { UPSTREAM_UNAVAILABLE } from "@/lib/response-status";

// Heavy companion to /api/widgets/homelab. That route stays light (one
// cluster/resources call) and drives the gauges at 15s; this one fans out
// per-guest detail calls and is polled at 30s.
export const dynamic = "force-dynamic";

export interface GuestDetail {
  vmid: number;
  node: string;
  kind: "lxc" | "qemu";
  running: boolean;
  uptimeSec: number;
  memBytes: number;
  maxMemBytes: number;
  swapBytes: number | null;
  maxSwapBytes: number | null;
  diskBytes: number;
  maxDiskBytes: number;
  /** qemu without a guest agent reports disk 0 — don't render it as "0 B used". */
  diskKnown: boolean;
  netInBytes: number;
  netOutBytes: number;
  diskReadBytes: number;
  diskWriteBytes: number;
  cpus: number;
  /** Parsed from config net0. "DHCP" when the container leases dynamically. */
  ip: string | null;
}

export interface NodeDetail {
  name: string;
  uptimeSec: number;
  /** 1 / 5 / 15 minute load average. */
  loadavg: [number, number, number];
  cpuModel: string;
  cpus: number;
  cores: number;
  memUsedBytes: number;
  memTotalBytes: number;
  swapUsedBytes: number;
  swapTotalBytes: number;
  rootfsUsedBytes: number;
  rootfsTotalBytes: number;
  pveVersion: string;
  /** This node exposes no temperature sensor via the API — null in practice. */
  tempC: number | null;
}

export interface HomelabDetailData {
  nodes: NodeDetail[];
  guests: GuestDetail[];
}

const EMPTY: HomelabDetailData = { nodes: [], guests: [] };

// Short server-side cache so several open tabs don't multiply the fan-out
// against PVE. Shorter than the client's 30s poll so data still moves.
const TTL_MS = 12000;
let cache: { at: number; payload: WidgetResponse<HomelabDetailData> } | null = null;

/** net0 = "name=eth0,...,ip=10.0.0.22/24,..." → "10.0.0.22" (or "DHCP"). */
function parseIp(net?: string): string | null {
  if (!net) return null;
  const match = /(?:^|,)ip=([^,]+)/.exec(net);
  if (!match) return null;
  const value = match[1].trim();
  if (!value || value.toLowerCase() === "dhcp") return value ? "DHCP" : null;
  return value.split("/")[0];
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

// Same single-source rule as the light route: no cluster/resources call, no
// response. Per-GUEST failures inside a successful fan-out are different — those
// degrade that guest only and stay 200.
const unavailable = () =>
  NextResponse.json(
    { status: "error", updatedAt: new Date().toISOString(), data: EMPTY } satisfies WidgetResponse<HomelabDetailData>,
    { status: UPSTREAM_UNAVAILABLE }
  );

export async function GET() {
  if (!hasPveCredentials()) return unavailable();

  if (cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json(cache.payload);
  }

  try {
    const resources = await pve("/cluster/resources");

    const nodeNames: string[] = resources
      .filter((r: { type: string }) => r.type === "node")
      .map((n: { node: string }) => n.node);

    const guestRefs = resources
      .filter((r: { type: string }) => r.type === "lxc" || r.type === "qemu")
      .map((g: { vmid: number; node: string; type: string; status: string }) => ({
        vmid: g.vmid,
        node: g.node,
        kind: g.type as "lxc" | "qemu",
        running: g.status === "running"
      }));

    // One fan-out for everything, so total latency is one round trip rather
    // than one per guest. Individual failures degrade that guest only.
    const [nodeResults, guestResults] = await Promise.all([
      Promise.all(
        nodeNames.map(async (name) => {
          const status = await pve(`/nodes/${name}/status`).catch(() => null);
          if (!status) return null;
          const load: string[] = Array.isArray(status.loadavg) ? status.loadavg : [];
          const detail: NodeDetail = {
            name,
            uptimeSec: num(status.uptime),
            loadavg: [
              Number(load[0] ?? 0) || 0,
              Number(load[1] ?? 0) || 0,
              Number(load[2] ?? 0) || 0
            ],
            cpuModel: status.cpuinfo?.model ?? "unknown",
            cpus: num(status.cpuinfo?.cpus),
            cores: num(status.cpuinfo?.cores),
            memUsedBytes: num(status.memory?.used),
            memTotalBytes: num(status.memory?.total),
            swapUsedBytes: num(status.swap?.used),
            swapTotalBytes: num(status.swap?.total),
            rootfsUsedBytes: num(status.rootfs?.used),
            rootfsTotalBytes: num(status.rootfs?.total),
            pveVersion: status.pveversion ?? "",
            // No temperature is exposed on this node's /status payload.
            tempC: typeof status.temperature === "number" ? status.temperature : null
          };
          return detail;
        })
      ),
      Promise.all(
        guestRefs.map(async (g: { vmid: number; node: string; kind: "lxc" | "qemu"; running: boolean }) => {
          const base = `/nodes/${g.node}/${g.kind}/${g.vmid}`;
          const [status, config] = await Promise.all([
            pve(`${base}/status/current`).catch(() => null),
            pve(`${base}/config`).catch(() => null)
          ]);

          const diskBytes = num(status?.disk);
          const maxDiskBytes = num(status?.maxdisk);
          const detail: GuestDetail = {
            vmid: g.vmid,
            node: g.node,
            kind: g.kind,
            running: g.running,
            uptimeSec: num(status?.uptime),
            memBytes: num(status?.mem),
            maxMemBytes: num(status?.maxmem),
            swapBytes: status && "swap" in status ? num(status.swap) : null,
            maxSwapBytes: status && "maxswap" in status ? num(status.maxswap) : null,
            diskBytes,
            maxDiskBytes,
            diskKnown: diskBytes > 0 && maxDiskBytes > 0,
            netInBytes: num(status?.netin),
            netOutBytes: num(status?.netout),
            diskReadBytes: num(status?.diskread),
            diskWriteBytes: num(status?.diskwrite),
            cpus: num(status?.cpus),
            ip: parseIp(config?.net0)
          };
          return detail;
        })
      )
    ]);

    const nodes = nodeResults.filter((n): n is NodeDetail => n !== null);
    const guests = guestResults.sort((a, b) => a.vmid - b.vmid);

    const payload: WidgetResponse<HomelabDetailData> = {
      status: "ok",
      updatedAt: new Date().toISOString(),
      data: { nodes, guests }
    };
    cache = { at: Date.now(), payload };
    return NextResponse.json(payload);
  } catch (err) {
    console.error("homelab detail fetch failed:", err instanceof Error ? err.message : err);
    return unavailable();
  }
}
