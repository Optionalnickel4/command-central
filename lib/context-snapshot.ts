import { formatUptime } from "@/lib/format";
import { getVaultProjectStatus } from "@/lib/vault";
import { normalizeMatch, unwrap, vlr, type VlrMatch } from "@/lib/vlr";
import { esportsEnabled } from "@/lib/features";

/**
 * Compact live snapshot of the dashboard, prepended to every chat turn so the
 * assistant can answer about the homelab, esports and its own stats instead of
 * saying it can't see them.
 *
 * Built by reusing the dashboard's OWN routes over loopback — they already do
 * the fetching, shaping and privacy-stripping, and several carry server-side
 * caches, so this adds almost nothing per turn. No new SSH scope, no new
 * secrets, and nothing here is written to disk.
 *
 * Budget: a few hundred tokens. It rides on EVERY message, so it is a digest of
 * numbers and states — never raw API payloads.
 */

const PORT = process.env.PORT || "3000";
const BASE = `http://127.0.0.1:${PORT}`;
// Most sources answer in <200ms. The Sol status route SSHes to 152 on a cold
// cc-stats cache and measured 4.1s (0.01s warm), so it gets its own budget —
// a shared 3.5s cap was silently dropping it as "unavailable".
const SOURCE_TIMEOUT_MS = 3000;
const SLOW_SOURCE_TIMEOUT_MS = 7000;
/** Rapid successive messages reuse the same snapshot. */
const CACHE_MS = 8000;

let cache: { at: number; text: string } | null = null;

async function grab<T>(path: string, timeoutMs = SOURCE_TIMEOUT_MS): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    // Every widget route wraps its payload and flags its own degraded state.
    if (json?.status === "error") return null;
    return (json?.data ?? null) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const pct = (used: number, total: number) => (total > 0 ? Math.round((used / total) * 100) : 0);

export async function buildContextSnapshot(): Promise<string> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.text;

  // With ENABLE_ESPORTS off the esports slice is simply absent — no fetch is
  // attempted, so a turn costs nothing and injects no "unavailable" noise.
  const esports = esportsEnabled();

  const [homelab, detail, matches, rankings, solStatus, usage, results, projects] = await Promise.all([
    grab<any>("/api/widgets/homelab"),
    grab<any>("/api/widgets/homelab-detail"),
    esports ? grab<any>("/api/widgets/esports/matches") : Promise.resolve(null),
    esports ? grab<any>("/api/widgets/esports/rankings") : Promise.resolve(null),
    grab<any>("/api/sol/status", SLOW_SOURCE_TIMEOUT_MS),
    grab<any>("/api/sol/usage"),
    // No widget route exposes results, so read them straight from vlr-api
    // (same client the panels use). Failure just drops the RECENT lines.
    esports
      ? vlr<unknown>("/matches/results", 3000)
          .then((raw) => unwrap<VlrMatch>(raw).map(normalizeMatch))
          .catch(() => null)
      : Promise.resolve(null),
    // Lifecycle, not health: the shared Obsidian vault on the local bind
    // mount, cached 10min and trimmed. Replaced the cc-projects SSH read of
    // PROJECTS.md on 152 — same context, no network hop. Returns null (section
    // omitted) rather than throwing if the mount is absent or unreadable.
    getVaultProjectStatus()
  ]);

  const lines: string[] = [];
  const alerts: string[] = [];

  // --- Homelab -----------------------------------------------------------
  if (homelab?.nodes?.length) {
    const node = homelab.nodes[0];
    const nodeDetail = detail?.nodes?.find((n: any) => n.name === node.name);
    const ramPct = pct(node.ramUsedGb, node.ramTotalGb);
    const load = nodeDetail?.loadavg
      ? ` | load ${nodeDetail.loadavg.map((l: number) => l.toFixed(2)).join("/")}`
      : "";
    const up = nodeDetail?.uptimeSec ? ` | up ${formatUptime(nodeDetail.uptimeSec)}` : "";
    const cores = nodeDetail?.cpus ? ` | ${nodeDetail.cores}c/${nodeDetail.cpus}t` : "";
    lines.push(
      `HOMELAB node ${node.name}: CPU ${node.cpuPct}% | RAM ${node.ramUsedGb}/${node.ramTotalGb}GB (${ramPct}%)${load}${cores}${up}`
    );

    if (ramPct >= 85) alerts.push(`node RAM at ${ramPct}% of capacity`);
    if (node.cpuPct >= 85) alerts.push(`node CPU at ${node.cpuPct}%`);
    if (nodeDetail?.loadavg?.[0] != null && nodeDetail?.cpus) {
      if (nodeDetail.loadavg[0] > nodeDetail.cpus) {
        alerts.push(`load ${nodeDetail.loadavg[0].toFixed(2)} exceeds ${nodeDetail.cpus} threads`);
      }
    }

    const guests: any[] = homelab.guests ?? [];
    const byVmid = new Map<number, any>((detail?.guests ?? []).map((g: any) => [g.vmid, g]));
    const online = guests.filter((g) => g.status === "ok").length;
    lines.push(`CONTAINERS (${online}/${guests.length} up):`);
    for (const g of guests) {
      const d = byVmid.get(g.vmid);
      const ip = d?.ip ? ` ${d.ip}` : "";
      const upStr = d?.uptimeSec ? ` up${formatUptime(d.uptimeSec).replace(/\s+/g, "")}` : "";
      if (g.status === "ok") {
        lines.push(`  ${g.vmid} ${g.name} ${g.type} up${ip} cpu${g.cpuPct}% mem${g.memPct}%${upStr}`);
      } else {
        lines.push(`  ${g.vmid} ${g.name} ${g.type} DOWN${ip}`);
      }
    }
    const down = guests.filter((g) => g.status !== "ok");
    if (down.length) {
      alerts.push(`${down.length} down: ${down.map((g) => `${g.vmid} ${g.name}`).join(", ")}`);
    }
  } else {
    lines.push("HOMELAB: unavailable (Proxmox feed not responding)");
  }

  lines.push(`ALERTS: ${alerts.length ? alerts.join("; ") : "none — all nominal"}`);

  // --- Esports (richer slice: broad questions answer without a lookup) ----
  // Skipped wholesale when the section is disabled for this instance.
  if (esports) {
    if (matches) {
      const live: any[] = matches.live ?? [];
      const upcoming: any[] = matches.upcoming ?? [];
      if (live.length) {
        lines.push(`ESPORTS LIVE (${live.length}):`);
        for (const m of live.slice(0, 3)) {
          lines.push(`  ${m.teamA} ${m.scoreA ?? "-"}\u2013${m.scoreB ?? "-"} ${m.teamB} (${m.event ?? "?"}${m.series ? `, ${m.series}` : ""})`);
        }
      } else {
        lines.push("ESPORTS LIVE: none right now");
      }
      if (upcoming.length) {
        lines.push("ESPORTS NEXT:");
        for (const m of upcoming.slice(0, 3)) {
          lines.push(`  ${m.teamA} vs ${m.teamB} in ${m.eta ?? m.time ?? "?"} (${m.event ?? "?"})`);
        }
      }
    } else {
      lines.push("ESPORTS: unavailable (vlr-api not responding)");
    }

    if (results?.length) {
      lines.push("ESPORTS RECENT:");
      for (const m of results.slice(0, 3)) {
        lines.push(`  ${m.teamA} ${m.scoreA ?? "-"}\u2013${m.scoreB ?? "-"} ${m.teamB} (${m.event ?? "?"})`);
      }
    }

    if (rankings?.teams?.length) {
      const top = rankings.teams.slice(0, 5)
        .map((t: any) => `${t.rank}. ${t.team} ${t.rating ?? "?"}`)
        .join(" | ");
      lines.push(`ESPORTS TOP TEAMS (regional ladder): ${top}`);
    }
  }

  // --- Sol's own stats ---------------------------------------------------
  if (solStatus) {
    const t = solStatus.tasks ?? {};
    const ok = t.byStatus?.succeeded ?? 0;
    const failed = t.byStatus?.failed ?? 0;
    const rate = ok + failed > 0 ? Math.round((ok / (ok + failed)) * 100) : null;
    const last = usage?.latest;
    const lastStr = last?.totalTokens
      ? ` | last turn ${last.totalTokens} tok, ${((last.durationMs ?? 0) / 1000).toFixed(1)}s`
      : "";
    lines.push(
      `SOL: v${solStatus.runtimeVersion} | tasks ${ok}/${ok + failed} ok${rate != null ? ` (${rate}%)` : ""} | ${solStatus.sessions?.count ?? "?"} sessions | model ${solStatus.sessions?.defaultModel ?? "?"}${lastStr}`
    );
  } else {
    lines.push("SOL STATS: unavailable (cc-stats link not responding)");
  }

  // --- Project status (lifecycle, from the Obsidian vault mount) ---------
  // Deliberately labelled apart from everything above: "what phase is mrvl-api
  // in" is a different question from "is mrvl-api responding", and without this
  // header the model answered the second when asked the first.
  if (projects) {
    lines.push(
      "PROJECT STATUS (lifecycle, not live health \u2014 what phase each project is in, what has shipped, what is next). Source: the shared Obsidian vault at /mnt/vault/Projects, the canonical project tracker, one file per project:"
    );
    lines.push(projects);
  }

  // Two variants, not a patched string: with esports off the model must not be
  // told it can answer about fixtures or that a lookup might arrive.
  lines.push(
    esports
      ? "YOU CAN ANSWER FROM THIS: any container's status/IP/CPU/memory/uptime, whether anything is wrong, current esports fixtures/results/rankings, and your own task/session/token stats. For a project (vlr-api, mrvl-api, ...), \"status\" means the PROJECT STATUS section \u2014 its phase, what shipped, what is next \u2014 NOT whether its service is up; only answer with uptime if the user explicitly asks about health, responding or downtime. For a SPECIFIC player, team, match or region not shown above, a live vlr-api lookup is attached under [ESPORTS LOOKUP] when relevant. Use these numbers rather than saying you lack access."
      : "YOU CAN ANSWER FROM THIS: any container's status/IP/CPU/memory/uptime, whether anything is wrong, and your own task/session/token stats. For a project (vlr-api, mrvl-api, ...), \"status\" means the PROJECT STATUS section \u2014 its phase, what shipped, what is next \u2014 NOT whether its service is up; only answer with uptime if the user explicitly asks about health, responding or downtime. Esports is not enabled on this instance (ENABLE_ESPORTS=false): say so plainly if asked about Valorant matches, teams or players \u2014 there is no esports data to look up. Use these numbers rather than saying you lack access."
  );

  const text = lines.join("\n");
  cache = { at: Date.now(), text };
  return text;
}

/** Wrap a user message with the snapshot, keeping the question clearly separate. */
export async function withContext(userMessage: string): Promise<string> {
  const snapshot = await buildContextSnapshot();
  const stamp = new Date().toISOString();
  return [
    `[SYSTEM CONTEXT — live dashboard snapshot, ${stamp}]`,
    snapshot,
    "[END CONTEXT]",
    "",
    `User: ${userMessage}`
  ].join("\n");
}
