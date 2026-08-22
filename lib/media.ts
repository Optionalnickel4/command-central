/**
 * Media stack clients (READ-ONLY).
 *
 * Six services, each with its own base URL, port and auth model — all confirmed
 * by probe from LXC 220 before this was written:
 *
 *   Jellyfin    http://media.lan:8096   X-Emby-Token header      (JusFlix 10.11.11)
 *   Sonarr      http://media.lan:8989   X-Api-Key header         (api/v3)
 *   Radarr      http://media.lan:7878   X-Api-Key header         (api/v3)
 *   Prowlarr    http://media.lan:9696   X-Api-Key header         (api/V1 — not v3)
 *   qBittorrent http://media.lan:8080   cookie login (SID)       (WebUI)
 *   Jellyseerr  http://media.lan:5055   X-Api-Key header         (3.3.0)
 *
 * media.lan resolves to 10.0.0.180 via Technitium, so the name is preferred —
 * it survives the host changing IP.
 *
 * Every call is server-side only: credentials never reach the browser, and no
 * credential is ever echoed into a response or a log line. Nothing here mutates
 * anything — no pause/delete/manage calls exist by design.
 */

export interface ServiceResult<T> {
  ok: boolean;
  data: T | null;
  /** Short, safe reason for the UI. Never contains credentials. */
  error: string | null;
}

const TIMEOUT_MS = 6000;

function ok<T>(data: T): ServiceResult<T> {
  return { ok: true, data, error: null };
}
function fail<T>(error: string): ServiceResult<T> {
  return { ok: false, data: null, error };
}

/** Translate transport/auth failures into something safe to display. */
function describe(err: unknown, status?: number): string {
  if (status === 401 || status === 403) return "auth failed — check the API key";
  if (status && status >= 500) return `service error (${status})`;
  if (status) return `unexpected response (${status})`;
  const msg = err instanceof Error ? err.message : "";
  if (/abort/i.test(msg)) return "timed out";
  if (/ECONNREFUSED|fetch failed|ENOTFOUND/i.test(msg)) return "unreachable";
  return "request failed";
}

async function getJson<T>(
  url: string,
  headers: Record<string, string>,
  timeoutMs = TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: controller.signal, cache: "no-store" });
    if (!res.ok) {
      const e = new Error(`http ${res.status}`);
      (e as any).status = res.status;
      throw e;
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

const env = (k: string) => (process.env[k] || "").trim();
const trimSlash = (s: string) => s.replace(/\/+$/, "");

/* ---------------------------------------------------------------- Jellyfin */

export interface JellyfinSession {
  user: string;
  title: string;
  subtitle: string | null;
  type: string | null;
  playMethod: string;
  isTranscoding: boolean;
  transcodeReason: string | null;
  positionTicks: number;
  runtimeTicks: number;
  progressPct: number;
  paused: boolean;
  device: string;
  client: string;
}

export interface JellyfinData {
  serverName: string | null;
  version: string | null;
  sessions: JellyfinSession[];
  counts: { movies: number | null; series: number | null; episodes: number | null } | null;
  latest: { id: string; name: string; type: string | null; year: number | null; series: string | null }[];
}

const TICKS_PER_SEC = 10_000_000;

export async function fetchJellyfin(): Promise<ServiceResult<JellyfinData>> {
  const base = trimSlash(env("JELLYFIN_URL"));
  const key = env("JELLYFIN_API_KEY");
  if (!base) return fail("JELLYFIN_URL not set");
  if (!key) return fail("JELLYFIN_API_KEY not set");
  const headers = { "X-Emby-Token": key, accept: "application/json" };

  try {
    // Public info doubles as a reachability probe and needs no key.
    const info = await getJson<any>(`${base}/System/Info/Public`, { accept: "application/json" })
      .catch(() => null);

    const [sessionsRaw, countsRaw, usersRaw] = await Promise.all([
      getJson<any[]>(`${base}/Sessions`, headers),
      getJson<any>(`${base}/Items/Counts`, headers).catch(() => null),
      getJson<any[]>(`${base}/Users`, headers).catch(() => null)
    ]);

    // "Recently added" must be fetched under a user context — the bare
    // /Items/Latest endpoint errors on this server. Use the first user.
    const userId = Array.isArray(usersRaw) && usersRaw.length ? usersRaw[0]?.Id : null;
    const latestRaw = userId
      ? await getJson<any[]>(`${base}/Users/${userId}/Items/Latest?Limit=8`, headers).catch(() => null)
      : null;

    const sessions: JellyfinSession[] = (Array.isArray(sessionsRaw) ? sessionsRaw : [])
      .filter((s) => s?.NowPlayingItem)
      .map((s) => {
        const item = s.NowPlayingItem ?? {};
        const play = s.PlayState ?? {};
        const runtime = Number(item.RunTimeTicks ?? 0);
        const pos = Number(play.PositionTicks ?? 0);
        const method = String(play.PlayMethod ?? "Unknown");
        const transcode = s.TranscodingInfo ?? null;
        return {
          user: s.UserName ?? "unknown",
          title: item.SeriesName ? item.SeriesName : item.Name ?? "Unknown",
          subtitle: item.SeriesName
            ? `${item.ParentIndexNumber != null ? `S${item.ParentIndexNumber}` : ""}${item.IndexNumber != null ? `E${item.IndexNumber}` : ""} ${item.Name ?? ""}`.trim()
            : item.ProductionYear
              ? String(item.ProductionYear)
              : null,
          type: item.Type ?? null,
          playMethod: method,
          isTranscoding: /transcode/i.test(method),
          transcodeReason: Array.isArray(transcode?.TranscodeReasons)
            ? transcode.TranscodeReasons.join(", ")
            : transcode?.TranscodeReasons ?? null,
          positionTicks: pos,
          runtimeTicks: runtime,
          progressPct: runtime > 0 ? Math.min(100, Math.round((pos / runtime) * 100)) : 0,
          paused: Boolean(play.IsPaused),
          device: s.DeviceName ?? "?",
          client: s.Client ?? "?"
        };
      });

    return ok({
      serverName: info?.ServerName ?? null,
      version: info?.Version ?? null,
      sessions,
      counts: countsRaw
        ? {
            movies: countsRaw.MovieCount ?? null,
            series: countsRaw.SeriesCount ?? null,
            episodes: countsRaw.EpisodeCount ?? null
          }
        : null,
      latest: (Array.isArray(latestRaw) ? latestRaw : []).slice(0, 8).map((i: any) => ({
        id: String(i.Id ?? ""),
        name: i.Name ?? "?",
        type: i.Type ?? null,
        year: i.ProductionYear ?? null,
        series: i.SeriesName ?? null
      }))
    });
  } catch (err) {
    return fail(describe(err, (err as any)?.status));
  }
}

export const ticksToClock = (ticks: number): string => {
  const total = Math.floor(ticks / TICKS_PER_SEC);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
};

/* ------------------------------------------------------------ Sonarr/Radarr */

export interface ArrQueueItem {
  title: string;
  status: string | null;
  progressPct: number;
  sizeLeft: number | null;
  size: number | null;
  quality: string | null;
}

export interface ArrUpcoming {
  title: string;
  subtitle: string | null;
  airsAt: string | null;
}

export interface ArrData {
  queue: ArrQueueItem[];
  queueTotal: number;
  upcoming: ArrUpcoming[];
}

async function fetchArr(
  kind: "sonarr" | "radarr",
  baseKey: string,
  apiKeyName: string
): Promise<ServiceResult<ArrData>> {
  const base = trimSlash(env(baseKey));
  const key = env(apiKeyName);
  if (!base) return fail(`${baseKey} not set`);
  if (!key) return fail(`${apiKeyName} not set`);
  const headers = { "X-Api-Key": key, accept: "application/json" };

  try {
    const now = new Date();
    const end = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    const range = `start=${now.toISOString().slice(0, 10)}&end=${end.toISOString().slice(0, 10)}`;

    const [queueRaw, calRaw] = await Promise.all([
      getJson<any>(`${base}/api/v3/queue?pageSize=20`, headers),
      getJson<any[]>(`${base}/api/v3/calendar?${range}`, headers).catch(() => null)
    ]);

    const records: any[] = Array.isArray(queueRaw) ? queueRaw : queueRaw?.records ?? [];
    const queue: ArrQueueItem[] = records.slice(0, 10).map((r) => {
      const size = Number(r.size ?? 0);
      const left = Number(r.sizeleft ?? r.sizeLeft ?? 0);
      return {
        title: r.title ?? r.series?.title ?? r.movie?.title ?? "?",
        status: r.status ?? null,
        progressPct: size > 0 ? Math.max(0, Math.min(100, Math.round(((size - left) / size) * 100))) : 0,
        sizeLeft: left || null,
        size: size || null,
        quality: r.quality?.quality?.name ?? null
      };
    });

    const upcoming: ArrUpcoming[] = (Array.isArray(calRaw) ? calRaw : [])
      .slice(0, 8)
      .map((c) =>
        kind === "sonarr"
          ? {
              title: c.series?.title ?? "?",
              subtitle: `${c.seasonNumber != null ? `S${c.seasonNumber}` : ""}${c.episodeNumber != null ? `E${c.episodeNumber}` : ""} ${c.title ?? ""}`.trim(),
              airsAt: c.airDateUtc ?? c.airDate ?? null
            }
          : {
              title: c.title ?? "?",
              subtitle: c.year ? String(c.year) : null,
              airsAt: c.digitalRelease ?? c.physicalRelease ?? c.inCinemas ?? null
            }
      );

    return ok({ queue, queueTotal: queueRaw?.totalRecords ?? records.length, upcoming });
  } catch (err) {
    return fail(describe(err, (err as any)?.status));
  }
}

export const fetchSonarr = () => fetchArr("sonarr", "SONARR_URL", "SONARR_API_KEY");
export const fetchRadarr = () => fetchArr("radarr", "RADARR_URL", "RADARR_API_KEY");

/* ---------------------------------------------------------------- Prowlarr */

export interface ProwlarrData {
  total: number;
  enabled: number;
  indexers: { name: string; protocol: string | null; enabled: boolean; priority: number | null }[];
}

export async function fetchProwlarr(): Promise<ServiceResult<ProwlarrData>> {
  const base = trimSlash(env("PROWLARR_URL"));
  const key = env("PROWLARR_API_KEY");
  if (!base) return fail("PROWLARR_URL not set");
  if (!key) return fail("PROWLARR_API_KEY not set");
  try {
    // Prowlarr is api/V1 — NOT v3 like Sonarr/Radarr. Confirmed by probe.
    const raw = await getJson<any[]>(`${base}/api/v1/indexer`, {
      "X-Api-Key": key,
      accept: "application/json"
    });
    const list = Array.isArray(raw) ? raw : [];
    return ok({
      total: list.length,
      enabled: list.filter((i) => i.enable).length,
      indexers: list.slice(0, 12).map((i) => ({
        name: i.name ?? "?",
        protocol: i.protocol ?? null,
        enabled: Boolean(i.enable),
        priority: typeof i.priority === "number" ? i.priority : null
      }))
    });
  } catch (err) {
    return fail(describe(err, (err as any)?.status));
  }
}

/* ------------------------------------------------------------- qBittorrent */

export interface QbitTorrent {
  name: string;
  state: string;
  progressPct: number;
  dlSpeed: number;
  upSpeed: number;
  etaSeconds: number | null;
  size: number | null;
}

export interface QbitData {
  torrents: QbitTorrent[];
  active: number;
  total: number;
  global: { dlSpeed: number; upSpeed: number } | null;
}

/** Session cookie, cached until it stops working. */
let qbitCookie: { value: string; at: number } | null = null;

async function qbitLogin(base: string, user: string, pass: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/api/v2/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // qBittorrent rejects cross-origin logins unless Referer matches.
        Referer: base
      },
      body: new URLSearchParams({ username: user, password: pass }).toString(),
      signal: controller.signal,
      cache: "no-store"
    });
    const body = (await res.text()).trim();
    if (!res.ok || /fail/i.test(body)) throw new Error("login rejected");
    const setCookie = res.headers.get("set-cookie") ?? "";
    // qBittorrent's session cookie is "SID" on older builds and
    // "QBT_SID_<port>" on newer ones — capture whichever name it sends
    // and hand the whole name=value pair back unchanged.
    const match = /(QBT_SID[^=]*|SID)=([^;]+)/i.exec(setCookie);
    if (!match) throw new Error("no session cookie");
    return `${match[1]}=${match[2]}`;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchQbittorrent(): Promise<ServiceResult<QbitData>> {
  const base = trimSlash(env("QBITTORRENT_URL"));
  const user = env("QBITTORRENT_USER");
  const pass = env("QBITTORRENT_PASS");
  if (!base) return fail("QBITTORRENT_URL not set");
  if (!user || !pass) return fail("QBITTORRENT_USER/PASS not set");

  const load = async (cookie: string) => {
    const headers = { Cookie: cookie, Referer: base, accept: "application/json" };
    const [torrentsRaw, transferRaw] = await Promise.all([
      getJson<any[]>(`${base}/api/v2/torrents/info?limit=20`, headers),
      getJson<any>(`${base}/api/v2/transfer/info`, headers).catch(() => null)
    ]);
    return { torrentsRaw, transferRaw };
  };

  try {
    // Reuse the cached cookie; re-login once if the session has expired.
    if (!qbitCookie || Date.now() - qbitCookie.at > 20 * 60_000) {
      qbitCookie = { value: await qbitLogin(base, user, pass), at: Date.now() };
    }
    let result;
    try {
      result = await load(qbitCookie.value);
    } catch (err) {
      if ((err as any)?.status === 403) {
        qbitCookie = { value: await qbitLogin(base, user, pass), at: Date.now() };
        result = await load(qbitCookie.value);
      } else {
        throw err;
      }
    }

    const list = Array.isArray(result.torrentsRaw) ? result.torrentsRaw : [];
    const torrents: QbitTorrent[] = list
      .slice()
      .sort((a, b) => (b.dlspeed ?? 0) - (a.dlspeed ?? 0))
      .slice(0, 10)
      .map((t) => ({
        name: t.name ?? "?",
        state: t.state ?? "?",
        progressPct: Math.round((Number(t.progress ?? 0)) * 100),
        dlSpeed: Number(t.dlspeed ?? 0),
        upSpeed: Number(t.upspeed ?? 0),
        etaSeconds: typeof t.eta === "number" && t.eta > 0 && t.eta < 8640000 ? t.eta : null,
        size: Number(t.size ?? 0) || null
      }));

    return ok({
      torrents,
      active: list.filter((t) => /downloading|uploading|forced/i.test(t.state ?? "")).length,
      total: list.length,
      global: result.transferRaw
        ? { dlSpeed: Number(result.transferRaw.dl_info_speed ?? 0), upSpeed: Number(result.transferRaw.up_info_speed ?? 0) }
        : null
    });
  } catch (err) {
    qbitCookie = null; // force a fresh login next time
    return fail(describe(err, (err as any)?.status));
  }
}

/* ------------------------------------------------------------------- Seerr */

export interface SeerrRequest {
  id: number;
  title: string;
  type: string | null;
  status: string;
  requestedBy: string | null;
  createdAt: string | null;
}

export interface SeerrData {
  version: string | null;
  pending: number;
  requests: SeerrRequest[];
}

/** Overseerr/Jellyseerr request status enum. */
const SEERR_STATUS: Record<number, string> = {
  1: "pending", 2: "approved", 3: "declined", 4: "failed", 5: "completed"
};

export async function fetchSeerr(): Promise<ServiceResult<SeerrData>> {
  const base = trimSlash(env("SEERR_URL"));
  const key = env("SEERR_API_KEY");
  if (!base) return fail("SEERR_URL not set");
  if (!key) return fail("SEERR_API_KEY not set");
  const headers = { "X-Api-Key": key, accept: "application/json" };

  try {
    const [status, reqRaw] = await Promise.all([
      getJson<any>(`${base}/api/v1/status`, { accept: "application/json" }).catch(() => null),
      getJson<any>(`${base}/api/v1/request?take=10&sort=added`, headers)
    ]);
    const results: any[] = Array.isArray(reqRaw) ? reqRaw : reqRaw?.results ?? [];
    const top = results.slice(0, 10);

    // The request payload's media object carries only tmdbId + mediaType, not a
    // human title — resolve each through Jellyseerr's TMDB proxy, in parallel.
    const titles = await Promise.all(
      top.map(async (r) => {
        const mt = r.type ?? r.media?.mediaType;
        const tmdbId = r.media?.tmdbId;
        if (!tmdbId || (mt !== "movie" && mt !== "tv")) return null;
        const meta = await getJson<any>(`${base}/api/v1/${mt}/${tmdbId}`, headers, 4000).catch(() => null);
        return meta ? meta.title ?? meta.name ?? null : null;
      })
    );

    const requests: SeerrRequest[] = top.map((r, idx) => ({
      id: Number(r.id ?? 0),
      title:
        titles[idx] ??
        r.media?.title ??
        r.media?.name ??
        r.media?.originalTitle ??
        (r.media?.tmdbId ? `tmdb:${r.media.tmdbId}` : "?"),
      type: r.type ?? r.media?.mediaType ?? null,
      status: SEERR_STATUS[Number(r.status)] ?? String(r.status ?? "?"),
      requestedBy: r.requestedBy?.displayName ?? r.requestedBy?.username ?? null,
      createdAt: r.createdAt ?? null
    }));
    return ok({
      version: status?.version ?? null,
      pending: requests.filter((r) => r.status === "pending").length,
      requests
    });
  } catch (err) {
    return fail(describe(err, (err as any)?.status));
  }
}

/** Human byte formatting for speeds/sizes. */
export function bytes(n: number | null | undefined, perSec = false): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}${perSec ? "/s" : ""}`;
}
