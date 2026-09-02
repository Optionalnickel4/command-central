/**
 * The homelab panels' data layer: the two Proxmox reads, shaped.
 *
 * Lives here rather than inline in the routes because the API routes are not
 * the only consumer — the assistant's context snapshot needs the same numbers,
 * and it must get them by CALLING these functions, never by fetching the
 * routes over loopback. A self-fetch carries no Cloudflare Access JWT, so the
 * auth layer (correctly) 401s it; a function call never becomes a request at
 * all, which is both the fix and the faster path.
 *
 * Everything here throws on failure. Turning a failure into an HTTP status is
 * the route's job, and degrading to "unavailable" is the snapshot's.
 */

import { pve } from "@/lib/pve";

export interface HomelabData {
  nodes: { name: string; online: boolean; cpuPct: number; ramUsedGb: number; ramTotalGb: number }[];
  guests: { vmid: number; name: string; type: "lxc" | "qemu"; status: "ok" | "error"; cpuPct: number; memPct: number }[];
}

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

/**
 * The detail fan-out is cached, so "when was this produced" is not the same as
 * "when was it asked for" — the route reports the former as `updatedAt`.
 */
export interface HomelabDetail {
  data: HomelabDetailData;
  fetchedAt: string;
}

/** The shape a failed detail read degrades to. */
export const EMPTY_DETAIL: HomelabDetailData = { nodes: [], guests: [] };

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

/** LIGHT read: one cluster/resources call. Drives the gauges and the ticker. */
export async function fetchHomelab(): Promise<HomelabData> {
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
  return { nodes, guests };
}

// Short server-side cache so several open tabs — and the assistant's snapshot —
// don't multiply the fan-out against PVE. Shorter than the client's 30s poll so
// data still moves.
const TTL_MS = 12000;
let cache: HomelabDetail | null = null;

/** HEAVY read: per-guest status/config plus node status, fanned out. */
export async function fetchHomelabDetail(): Promise<HomelabDetail> {
  if (cache && Date.now() - Date.parse(cache.fetchedAt) < TTL_MS) return cache;

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

  cache = { data: { nodes, guests }, fetchedAt: new Date().toISOString() };
  return cache;
}
