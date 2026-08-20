/**
 * Server-side client for the self-hosted vlr-api (Valorant esports data).
 *
 * Only ever imported by routes under app/api/widgets/esports/* — the base URL
 * stays on the server and the browser never talks to 10.0.0.82 directly.
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
