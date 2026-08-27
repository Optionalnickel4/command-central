/**
 * Server-side client for the self-hosted vlr-api (Valorant esports data).
 *
 * Only ever imported by routes under app/api/widgets/esports/* — the base URL
 * stays on the server and the browser never talks to 10.0.0.21 directly.
 *
 * Plain fetch is correct here: vlr-api is HTTP with a normal cert story. The
 * Node-https rule in CLAUDE.md is specific to Proxmox's self-signed endpoint.
 */

const BASE = process.env.VLR_API_URL;

export function hasVlrConfig(): boolean {
  return Boolean(BASE);
}

/** Fetch one vlr-api path. Throws on any failure; routes catch and degrade. */
export async function vlr<T = unknown>(path: string, timeoutMs = 8000): Promise<T> {
  if (!BASE) throw new Error("VLR_API_URL is not set");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/api/v1${path}`, {
      signal: controller.signal,
      cache: "no-store",
      headers: { accept: "application/json" }
    });
    if (!res.ok) throw new Error(`vlr-api ${path} -> ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * vlr-api is inconsistent about envelopes: /matches/*, /rankings, /news and
 * /events return bare arrays, while /stats returns { data, stale, error }.
 * Verified by curl — normalise both rather than assuming either.
 */
export function unwrap<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object") {
    const data = (payload as { data?: unknown }).data;
    if (Array.isArray(data)) return data as T[];
  }
  return [];
}

/** Some envelopes flag stale cache reads; surface it rather than hiding it. */
export function isStale(payload: unknown): boolean {
  return Boolean(
    payload && typeof payload === "object" && (payload as { stale?: boolean }).stale
  );
}

/** A match as vlr-api actually returns it (same shape for live/upcoming/results). */
export interface VlrMatch {
  id: string;
  url: string;
  /** Local kickoff time, e.g. "5:00 PM". */
  time: string | null;
  /** Countdown for upcoming ("47m"), elapsed for results ("8h 28m"). */
  eta: string | null;
  status: string;
  /** Always two entries in practice, but never assume. */
  teams: string[];
  /** Strings, and "–" (en dash) for matches that haven't started. */
  scores: string[];
  event: string | null;
  series: string | null;
}

/** Normalise a raw match into something the UI can render without guards. */
export function normalizeMatch(raw: VlrMatch) {
  const teams = Array.isArray(raw.teams) ? raw.teams : [];
  const scores = Array.isArray(raw.scores) ? raw.scores : [];
  const score = (i: number) => {
    const v = (scores[i] ?? "").toString().trim();
    // "–"/"-"/"" all mean "not played yet".
    return /^\d+$/.test(v) ? Number(v) : null;
  };
  return {
    id: String(raw.id ?? ""),
    url: raw.url ?? "",
    time: raw.time ?? null,
    eta: raw.eta ?? null,
    status: raw.status ?? "",
    event: raw.event ?? null,
    series: raw.series ?? null,
    teamA: teams[0] ?? "TBD",
    teamB: teams[1] ?? "TBD",
    scoreA: score(0),
    scoreB: score(1)
  };
}

export type Match = ReturnType<typeof normalizeMatch>;

/* ------------------------------------------------------------------------ *
 * On-demand lookup for the assistant
 *
 * A single bounded round-trip: the chat route decides what to fetch, calls one
 * of these, and feeds the compact result back so the model answers from real
 * data. Shapes below were re-curled against the live API, not assumed —
 * notably /players?q= returns {results:[…]}, /players/{id}/dimensions returns
 * {detail:"…"} when the player isn't on a leaderboard, and /rankings is still
 * concatenated per-region blocks.
 * ------------------------------------------------------------------------ */

export type LookupKind =
  | "player" | "team" | "match" | "rankings" | "stats"
  | "results" | "upcoming" | "live" | "events" | "none";

export interface LookupResult {
  kind: LookupKind;
  query: string;
  /** Compact text handed back to the model. */
  text: string;
  found: boolean;
}

const short = (v: unknown, n = 60) => String(v ?? "").slice(0, n);

/** Find a player id by name via the search endpoint. */
async function findPlayer(name: string): Promise<{ id: string; alias: string; team: string | null } | null> {
  const raw = await vlr<any>(`/players?q=${encodeURIComponent(name)}`, 6000);
  const rows: any[] = Array.isArray(raw) ? raw : raw?.results ?? raw?.data ?? [];
  if (!rows.length) return null;
  const exact = rows.find((r) => String(r.alias ?? "").toLowerCase() === name.toLowerCase());
  const pick = exact ?? rows[0];
  return pick ? { id: String(pick.id), alias: pick.alias, team: pick.team ?? null } : null;
}

/** Find a team id by name from the rankings blocks. */
async function findTeam(name: string): Promise<{ id: string; team: string } | null> {
  const raw = await vlr<any>("/rankings", 6000);
  const rows = unwrap<any>(raw);
  const needle = name.toLowerCase();
  const hit =
    rows.find((r) => String(r.team ?? "").toLowerCase() === needle) ??
    rows.find((r) => String(r.team ?? "").toLowerCase().includes(needle));
  return hit ? { id: String(hit.team_id), team: hit.team } : null;
}

/**
 * Team results/upcoming use their OWN shape — {opponent, result, score:"2:1",
 * date} — not the {teams[], scores[]} of /matches/*. Verified by curl; the
 * generic formatter rendered every score as "?-?" before this existed.
 * For upcoming rows `score` carries a countdown and `result` is null.
 */
const teamMatchLine = (m: any, upcoming = false) => {
  const when = short(m.date, 24);
  if (upcoming) return `vs ${m.opponent ?? "?"} — in ${m.score ?? "?"} (${short(m.event, 34)}, ${when})`;
  const verdict = m.result ? m.result.toUpperCase() : "?";
  return `${verdict} ${m.score ?? "?"} vs ${m.opponent ?? "?"} (${short(m.event, 34)}, ${when})`;
};

const matchLine = (m: any) => {
  const t = Array.isArray(m.teams) ? m.teams : [];
  const s = Array.isArray(m.scores) ? m.scores : [];
  return `${t[0] ?? "?"} ${s[0] ?? "-"}–${s[1] ?? "-"} ${t[1] ?? "?"} (${short(m.event, 40)})`;
};

/**
 * Run one lookup. Never throws: a failure or miss comes back as text the model
 * can relay honestly rather than invent around.
 */
export async function runVlrLookup(kind: LookupKind, query: string): Promise<LookupResult> {
  const miss = (text: string): LookupResult => ({ kind, query, text, found: false });
  try {
    switch (kind) {
      case "player": {
        const p = await findPlayer(query);
        if (!p) return miss(`No player found matching "${query}".`);
        const prof = await vlr<any>(`/player/${p.id}`, 8000);
        const agents: string[] = (prof?.agent_stats ?? []).slice(0, 4).map((a: any) => {
          const s = a.stats ?? {};
          return `${a.agent}: R ${s.R ?? "?"}, ACS ${s.ACS ?? "?"}, K:D ${s["K:D"] ?? "?"}, KAST ${s.KAST ?? "?"} (${s.Rnd ?? "?"} rnds)`;
        });
        const dims = await vlr<any>(`/players/${p.id}/dimensions`, 8000).catch(() => null);
        const dimLine =
          dims && typeof dims.firepower === "number"
            ? `4-axis percentiles — firepower ${dims.firepower}, entry ${dims.entry}, consistency ${dims.consistency}, clutch ${dims.clutch} (${dims.region}/${dims.timespan})`
            : `4-axis percentiles: not on the current leaderboard${dims?.detail ? ` (${short(dims.detail, 70)})` : ""}`;
        return {
          kind, query, found: true,
          text: [
            `PLAYER ${prof?.alias ?? p.alias}${prof?.real_name ? ` (${prof.real_name})` : ""} — id ${p.id}, country ${prof?.country ?? "?"}, team ${prof?.team ?? p.team ?? "none listed"}`,
            agents.length ? `Top agents: ${agents.join(" | ")}` : "No agent stats listed.",
            dimLine
          ].join("\n")
        };
      }
      case "team": {
        const t = await findTeam(query);
        if (!t) return miss(`No team found matching "${query}" in the rankings feed.`);
        const info = await vlr<any>(`/team/${t.id}`, 8000);
        const roster = (info?.roster ?? []).filter((r: any) => !r.is_staff)
          .map((r: any) => r.alias).slice(0, 8).join(", ");
        const results = (info?.results ?? []).slice(0, 4).map((r: any) => teamMatchLine(r));
        const upcoming = (info?.upcoming ?? []).slice(0, 3).map((r: any) => teamMatchLine(r, true));
        return {
          kind, query, found: true,
          text: [
            `TEAM ${info?.name ?? t.team} (${info?.tag ?? "?"}) — id ${t.id}, ${info?.country ?? "?"}`,
            roster ? `Roster: ${roster}` : "",
            results.length ? `Recent results:\n  ${results.join("\n  ")}` : "No recent results listed.",
            upcoming.length ? `Upcoming:\n  ${upcoming.join("\n  ")}` : ""
          ].filter(Boolean).join("\n")
        };
      }
      case "match": {
        const id = query.replace(/\D/g, "");
        if (!id) return miss(`No match id in "${query}".`);
        const m = await vlr<any>(`/match/${id}`, 8000);
        if (!m || m.detail) return miss(`No match found with id ${id}.`);
        return { kind, query, found: true, text: `MATCH ${id}: ${JSON.stringify(m).slice(0, 1200)}` };
      }
      case "rankings": {
        const region = query.trim().toLowerCase();
        const raw = await vlr<any>(region ? `/rankings?region=${encodeURIComponent(region)}` : "/rankings", 6000);
        const rows = unwrap<any>(raw);
        if (!rows.length) return miss(`No ranking data for region "${region || "all"}".`);
        // Concatenated per-region blocks: a new block starts when rank resets.
        const block: any[] = [];
        for (const r of rows) {
          const rank = Number(r.rank);
          if (block.length && rank <= Number(block[block.length - 1].rank)) break;
          block.push(r);
        }
        const list = block.slice(0, 10)
          .map((r) => `${r.rank}. ${r.team} (${r.country ?? "?"}) ${r.rating ?? "?"}`);
        return {
          kind, query, found: true,
          text: `RANKINGS${region ? ` [region=${region}]` : " (first regional block)"}:\n  ${list.join("\n  ")}`
        };
      }
      case "stats": {
        const raw = await vlr<any>("/stats", 8000);
        const rows = unwrap<any>(raw);
        if (!rows.length) return miss("No stats leaderboard data.");
        const top = rows
          .slice()
          .sort((a: any, b: any) => (b.r2 ?? 0) - (a.r2 ?? 0))
          .slice(0, 10)
          .map((p: any, i: number) =>
            `${i + 1}. ${p.player}${p.team ? ` (${p.team})` : ""} R2.0 ${p.r2}, ACS ${p.acs}, K/D ${p.kd}, KAST ${p.kast}%`);
        return { kind, query, found: true, text: `STATS LEADERS (R2.0 = composite rating, not K/D):\n  ${top.join("\n  ")}` };
      }
      case "results":
      case "upcoming":
      case "live": {
        const raw = await vlr<any>(`/matches/${kind}`, 6000);
        const rows = unwrap<VlrMatch>(raw).slice(0, 8);
        if (!rows.length) return miss(`No ${kind} matches on the feed right now.`);
        const list = rows.map((m: any) => {
          const eta = m.eta ? ` [${kind === "upcoming" ? "in " : ""}${m.eta}]` : "";
          return `${matchLine(m)}${eta}`;
        });
        return { kind, query, found: true, text: `${kind.toUpperCase()} MATCHES:\n  ${list.join("\n  ")}` };
      }
      case "events": {
        const raw = await vlr<any>("/events", 6000);
        const rows = unwrap<any>(raw).slice(0, 10);
        if (!rows.length) return miss("No events listed.");
        const list = rows.map((e: any) => `${e.title} — ${e.status}, ${e.dates}, prize ${e.prize ?? "?"} (${e.region ?? "?"})`);
        return { kind, query, found: true, text: `EVENTS:\n  ${list.join("\n  ")}` };
      }
      default:
        return miss("No lookup performed.");
    }
  } catch (err) {
    return miss(`Esports lookup failed (${err instanceof Error ? err.message : "error"}); vlr-api may be unreachable.`);
  }
}
