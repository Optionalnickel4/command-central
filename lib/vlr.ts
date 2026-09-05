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

/**
 * The newer endpoints (/teams, /assistant/team-match, /stats) always answer in
 * a { data, stale, error } envelope, and — importantly — return HTTP 200 even
 * when they have nothing, carrying the reason in `error`. Read both rather
 * than treating a miss as a transport failure.
 */
export interface Envelope<T> {
  data: T | null;
  stale: boolean;
  error: string | null;
}

export function envelope<T>(payload: unknown): Envelope<T> {
  if (payload && typeof payload === "object" && "data" in (payload as object)) {
    const e = payload as { data?: unknown; stale?: boolean; error?: unknown };
    return {
      data: (e.data ?? null) as T | null,
      stale: Boolean(e.stale),
      error: e.error == null ? null : String(e.error)
    };
  }
  // Bare payload (the older array endpoints) — not an error, just no envelope.
  return { data: (payload ?? null) as T | null, stale: false, error: null };
}

/**
 * team-match dates arrive as the date and time run together with no separator
 * — "2026/09/027:30 pm". Split them instead of reading the glued string out
 * loud. Anything that doesn't fit the pattern is passed through untouched.
 */
export function splitVlrDate(raw: unknown): string {
  const v = String(raw ?? "").trim();
  if (!v) return "";
  const m = /^(\d{4})\/(\d{2})\/(\d{2})\s*(.*)$/.exec(v);
  if (!m) return v;
  const [, y, mo, d, time] = m;
  return time ? `${y}/${mo}/${d} at ${time}` : `${y}/${mo}/${d}`;
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
  | "results" | "upcoming" | "live" | "events" | "none"
  // Added with the assistant-friendly endpoints: one team-name question
  // ("who's winning", "are they playing today", "how did they do") resolves
  // through /assistant/team-match, and a standings question through
  // /teams?q= + /rankings.
  | "team-match" | "team-rank";

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

/**
 * Resolve a team name to an id. /teams?q= is DB-first and cached, and — unlike
 * the rankings scan this used to do alone — it finds teams that are not
 * currently ranked (FNATIC resolves here but is absent from the rankings
 * feed). The rankings scan stays as the fallback for anything the DB misses.
 */
async function findTeam(name: string): Promise<{ id: string; team: string } | null> {
  const needle = name.trim().toLowerCase();
  if (!needle) return null;
  try {
    const env = envelope<any[]>(await vlr<any>(`/teams?q=${encodeURIComponent(name)}`, 6000));
    const rows = Array.isArray(env.data) ? env.data : [];
    const exact = rows.find((r) => String(r.name ?? "").toLowerCase() === needle);
    const pick = exact ?? rows[0];
    if (pick?.id) return { id: String(pick.id), team: String(pick.name ?? name) };
  } catch {
    /* fall through to the rankings scan */
  }
  const raw = await vlr<any>("/rankings", 6000);
  const rows = unwrap<any>(raw);
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
 * The two leaderboard endpoints take DIFFERENT region vocabularies, verified by
 * curl against the live API: /rankings wants the long slug ("north-america")
 * and rejects "na" with a 400, while /stats accepts ONLY "na" or "eu". Passing
 * the parsed short code straight through — what this used to do — turned every
 * regional rankings question into a failed lookup.
 */
const RANKINGS_REGION: Record<string, string> = {
  na: "north-america", americas: "north-america", "north-america": "north-america",
  eu: "europe", emea: "europe", europe: "europe",
  br: "brazil", brazil: "brazil",
  ap: "asia-pacific", pacific: "asia-pacific", apac: "asia-pacific", "asia-pacific": "asia-pacific",
  kr: "korea", korea: "korea",
  cn: "china", china: "china",
  jp: "japan", japan: "japan",
  oce: "oceania", oceania: "oceania",
  mena: "mena", gc: "gc", collegiate: "collegiate", all: "all"
};

/** /stats only has these two regions; anything else must go unfiltered. */
const STATS_REGION: Record<string, string> = {
  na: "na", americas: "na", "north-america": "na",
  eu: "eu", emea: "eu", europe: "eu"
};

const STATS_TIMESPAN = new Set(["30d", "60d", "90d", "all"]);

/**
 * The current-map round score — the "leads 4-2" answer that is the whole point
 * of the live branch.
 *
 * Every live match on the feed during development was still pre-first-map
 * (VLR marks a match live when its page opens, before a map is picked), so
 * `current_map` was null in every sample and its exact key names could not be
 * pinned the way the other three states were. Read the plausible spellings
 * tolerantly, and when nothing numeric is there say the score is not posted
 * yet — never render a null as 0-0.
 */
function readRounds(cm: any): { map: string | null; team: number | null; opp: number | null } {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v
    : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v.trim()) : null);
  if (!cm || typeof cm !== "object") return { map: null, team: null, opp: null };
  const c = cm as Record<string, any>;
  const score = (c.score ?? c.rounds ?? c.round_score ?? {}) as Record<string, any>;
  return {
    map: (c.name ?? c.map ?? c.map_name ?? null) || null,
    team: num(c.team ?? c.team_rounds ?? c.team_score ?? score.team),
    opp: num(c.opponent ?? c.opponent_rounds ?? c.opponent_score ?? score.opponent)
  };
}

/** Orient a two-sided score to the team that was asked about. */
function orient(team: string, opp: string, t: number, o: number, suffix: string): string {
  const verb = t > o ? "leads" : t < o ? "trails" : "is tied with";
  return `${team} ${verb} ${opp} ${t}\u2013${o}${suffix}`;
}

export interface TeamMatchData {
  state: "live" | "upcoming" | "completed" | "none" | string;
  team: { id?: string; name?: string; tag?: string | null } | null;
  match: Record<string, any> | null;
}

/**
 * Turn one /assistant/team-match envelope into text the model can read out.
 *
 * Branches on `state` explicitly — never on the shape of the data — because
 * the endpoint answers 200 for all four states including "none". Exported so
 * the state branches can be tested against captured payloads without the API.
 */
export function formatTeamMatch(
  asked: string,
  env: Envelope<TeamMatchData>
): { text: string; found: boolean } {
  const d = env.data;
  const state = String(d?.state ?? "none");
  const name = d?.team?.name || asked;
  const m = d?.match ?? {};
  const opp = String(m.opponent ?? "their opponent");
  const event = m.event ? String(m.event) : null;
  const stale = env.stale ? "\n(Served from a stale cache — say the figure may be a few minutes behind.)" : "";
  const head = `TEAM MATCH \u2014 ${name}: STATE=${state}`;

  if (state === "none" || !d?.match) {
    return {
      found: false,
      text: [
        `TEAM MATCH \u2014 "${asked}": STATE=none.`,
        `vlr-api found no team by that name${env.error ? ` (${short(env.error, 90)})` : ""}.`,
        `Say you couldn't find a team called "${asked}". Do NOT substitute a similarly named team or invent a result.`
      ].join("\n")
    };
  }

  if (state === "live") {
    const ms = (m.map_score ?? {}) as Record<string, any>;
    const mt = typeof ms.team === "number" ? ms.team : null;
    const mo = typeof ms.opponent === "number" ? ms.opponent : null;
    const { map, team: rt, opp: ro } = readRounds(m.current_map);
    const lines = [
      head,
      `${name} vs ${opp} \u2014 LIVE NOW${event ? ` at ${short(event, 60)}` : ""}${m.series ? ` (${short(m.series, 40)})` : ""}${m.format ? ` [${m.format}]` : ""}`
    ];
    if (rt !== null && ro !== null) {
      lines.push(`Current map${map ? ` (${map})` : ""}: ${orient(name, opp, rt, ro, " in rounds")}`);
    } else {
      lines.push(
        `Current map: no round score posted yet${map ? ` (map: ${map})` : " (the first map hasn't started)"}. Say the match is live but the round score isn't up yet \u2014 do NOT invent or assume one.`
      );
    }
    if (mt !== null && mo !== null) lines.push(`Maps won: ${orient(name, opp, mt, mo, " in maps")}`);
    else lines.push(`Maps won: not posted yet.`);
    lines.push(`Lead with the fact that ${name} are playing RIGHT NOW, and give the round score above if there is one.`);
    return { found: true, text: lines.join("\n") + stale };
  }

  if (state === "upcoming") {
    return {
      found: true,
      text: [
        head,
        `${name} are NOT live right now.`,
        `Next match: ${name} vs ${opp}${event ? ` \u2014 ${short(event, 60)}` : ""}${m.date ? `, ${splitVlrDate(m.date)}` : ""}.`,
        `Say they aren't playing at the moment and give that fixture and time.`
      ].join("\n") + stale
    };
  }

  if (state === "completed") {
    const verdict = m.result ? String(m.result).toUpperCase() : "played";
    return {
      found: true,
      text: [
        head,
        `${name} are NOT live, and the feed lists no scheduled next match for them.`,
        `Last match: ${verdict} ${m.score ?? "?"} vs ${opp}${event ? ` \u2014 ${short(event, 60)}` : ""}${m.date ? `, ${splitVlrDate(m.date)}` : ""}.`,
        `Give that result. The score is written team-first (${name} first).`
      ].join("\n") + stale
    };
  }

  // Unknown state: report it rather than guessing which branch it resembles.
  return {
    found: false,
    text: `${head}. Unrecognised state for ${name} \u2014 say you couldn't get a clear answer for that team right now.`
  };
}

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
      /**
       * The team-name question ("who's winning", "are they playing today",
       * "how did they do") — one call, four states. The endpoint answers
       * 200 even when it found nothing, so branch on `state`, never on
       * whether `match` happens to look live.
       */
      case "team-match": {
        const name = query.trim();
        if (!name) return miss("No team name was picked out of that question.");
        const env = envelope<TeamMatchData>(
          await vlr<any>(`/assistant/team-match?name=${encodeURIComponent(name)}`, 8000)
        );
        const { text, found } = formatTeamMatch(name, env);
        return { kind, query, text, found };
      }

      /**
       * Where a team sits in the standings. /rankings is served as
       * concatenated per-region blocks with the rank restarting in each, so a
       * row's rank is its REGIONAL rank — the text says so rather than
       * implying a global position the feed never states.
       */
      case "team-rank": {
        const name = query.trim();
        if (!name) return miss("No team name was picked out of that question.");
        const t = await findTeam(name);
        const canonical = t?.team ?? name;
        const needle = canonical.toLowerCase();
        const rows = unwrap<any>(await vlr<any>("/rankings", 6000));
        const rank = (r: any) => Number(r?.rank ?? 0);
        let idx = rows.findIndex((r) => String(r.team ?? "").toLowerCase() === needle);
        if (idx < 0 && t?.id) idx = rows.findIndex((r) => String(r.team_id ?? "") === t.id);
        if (idx < 0) idx = rows.findIndex((r) => String(r.team ?? "").toLowerCase().includes(needle));
        if (idx < 0) {
          if (!t) {
            return miss(`No team called "${name}" was found. Say you couldn't find that team; do not guess at a ranking.`);
          }
          return {
            kind, query, found: true,
            text: `TEAM RANK — ${canonical}: not present in the rankings feed. The team exists (id ${t.id}) but is not in the current standings, so it has no ranking to report. Say that plainly — do NOT invent a position.`
          };
        }
        // Walk out to the edges of this team's regional block.
        let start = idx;
        while (start > 0 && rank(rows[start - 1]) < rank(rows[start])) start--;
        let end = idx;
        while (end + 1 < rows.length && rank(rows[end + 1]) > rank(rows[end])) end++;
        const me = rows[idx];
        const bits = [
          me.rating ? `rating ${me.rating}` : "",
          me.record ? `record ${me.record}` : "",
          me.earnings ? `earnings ${me.earnings}` : ""
        ].filter(Boolean).join(", ");
        const near = rows
          .slice(Math.max(start, idx - 2), Math.min(end + 1, idx + 3))
          .map((r) => `${r.rank === me.rank ? "> " : "  "}${r.rank}. ${r.team}${r.rating ? ` ${r.rating}` : ""}${r.record ? ` (${r.record})` : ""}`);
        return {
          kind, query, found: true,
          text: [
            // The unfiltered feed omits the record/earnings the per-region one
            // carries, so those clauses are dropped rather than read out as "?".
            `TEAM RANK — ${me.team}${me.country ? ` (${me.country})` : ""}: #${me.rank} in its region${bits ? `, ${bits}` : ""}.`,
            `The feed ranks per region, so #${me.rank} is its REGIONAL position, not a world rank — say it that way.`,
            `Nearby:\n  ${near.join("\n  ")}`
          ].join("\n")
        };
      }

      case "rankings": {
        const asked = query.trim().toLowerCase();
        // "na" is a 400 here; the endpoint wants "north-america" (see
        // RANKINGS_REGION). An unknown code goes unfiltered rather than failing.
        const region = asked ? RANKINGS_REGION[asked] ?? "" : "";
        const raw = await vlr<any>(region ? `/rankings?region=${encodeURIComponent(region)}` : "/rankings", 6000);
        const rows = unwrap<any>(raw);
        if (!rows.length) return miss(`No ranking data for region "${region || asked || "all"}".`);
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
          text: `RANKINGS${region ? ` [region=${region}]` : asked ? ` (region "${asked}" isn't one the feed filters on — showing the first regional block)` : " (first regional block)"}:\n  ${list.join("\n  ")}`
        };
      }
      case "stats": {
        // query is an optional "region:timespan" pair from the parse; both
        // sides are validated against what the endpoint actually accepts
        // (na|eu, and 30d|60d|90d|all) because it 400s on anything else.
        const [rawRegion = "", rawSpan = ""] = query.trim().toLowerCase().split(":");
        const region = STATS_REGION[rawRegion] ?? "";
        const span = STATS_TIMESPAN.has(rawSpan) ? rawSpan : "";
        const qs = [region ? `region=${region}` : "", span ? `timespan=${span}` : ""]
          .filter(Boolean).join("&");
        const raw = await vlr<any>(qs ? `/stats?${qs}` : "/stats", 10000);
        const rows = unwrap<any>(raw);
        if (!rows.length) return miss(`No stats leaderboard data${region ? ` for ${region}` : ""}.`);
        const scope = [
          region ? `region=${region}` : "all regions",
          span ? `timespan=${span}` : "default timespan",
          rawRegion && !region
            ? `(the leaderboard only covers na and eu, so "${rawRegion}" could not be filtered — say so)`
            : ""
        ].filter(Boolean).join(", ");
        const top = rows
          .slice()
          .sort((a: any, b: any) => (b.r2 ?? 0) - (a.r2 ?? 0))
          .slice(0, 10)
          .map((p: any, i: number) =>
            `${i + 1}. ${p.player}${p.team ? ` (${p.team})` : ""} R2.0 ${p.r2}, ACS ${p.acs}, K/D ${p.kd}, KAST ${p.kast}%`);
        return {
          kind, query, found: true,
          text: `STATS LEADERS [${scope}] — rank 1 is the top performer; R2.0 is a composite rating, not K/D:\n  ${top.join("\n  ")}`
        };
      }
      case "results":
      case "upcoming":
      case "live": {
        const raw = await vlr<any>(`/matches/${kind}`, 6000);
        const rows = unwrap<VlrMatch>(raw).slice(0, 8);
        if (!rows.length) {
          // Honest-data rule: an empty live feed means nothing is being played
          // right now. That is a real answer and must be reported as one —
          // found:true — because found:false makes the model say the data is
          // unavailable, which was the old wrong behaviour.
          return {
            kind, query, found: true,
            text: kind === "live"
              ? "LIVE MATCHES: none. The live feed is empty, which means NO Valorant matches are being played right now. Answer that nothing is live at the moment — this is a definitive answer from the live feed, NOT missing data. Do not say the API doesn't have it or that you can't check."
              : `${kind.toUpperCase()} MATCHES: none listed on the feed right now. That is the feed's actual answer, not missing data.`
          };
        }
        const list = rows.map((m: any) => {
          const eta = m.eta ? ` [${kind === "upcoming" ? "in " : ""}${m.eta}]` : "";
          return `${matchLine(m)}${eta}`;
        });
        return { kind, query, found: true, text: `${kind.toUpperCase()} MATCHES:\n  ${list.join("\n  ")}` };
      }
      case "events": {
        const raw = await vlr<any>("/events", 6000);
        const all = unwrap<any>(raw);
        if (!all.length) {
          return {
            kind, query, found: true,
            text: "EVENTS: none listed. No tournaments are running or scheduled on the feed right now — report that as the answer, not as missing data."
          };
        }
        const line = (e: any) => `${short(e.title, 60)} — ${e.status}, ${e.dates}, prize ${e.prize ?? "?"} (${e.region ?? "?"})`;
        const isState = (e: any, v: string) => String(e.status ?? "").toLowerCase() === v;
        const ongoing = all.filter((e: any) => isState(e, "ongoing"));
        const soon = all.filter((e: any) => isState(e, "upcoming"));
        const section = (label: string, rows: any[], n: number) =>
          rows.length ? `${label}:\n  ${rows.slice(0, n).map(line).join("\n  ")}` : "";
        return {
          kind, query, found: true,
          text: [
            `EVENTS — ${ongoing.length} running now, ${soon.length} upcoming:`,
            section("ONGOING (what's on this week)", ongoing, 8),
            section("UPCOMING", soon, 5),
            ongoing.length || soon.length ? "" : section("LISTED", all, 8)
          ].filter(Boolean).join("\n")
        };
      }
      default:
        return miss("No lookup performed.");
    }
  } catch (err) {
    return miss(`Esports lookup failed (${err instanceof Error ? err.message : "error"}); vlr-api may be unreachable.`);
  }
}
