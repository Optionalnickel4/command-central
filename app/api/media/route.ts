import { NextResponse } from "next/server";
import {
  fetchJellyfin, fetchSonarr, fetchRadarr, fetchProwlarr, fetchQbittorrent, fetchSeerr,
  type ServiceResult
} from "@/lib/media";

export const dynamic = "force-dynamic";

/**
 * One route, six independent services.
 *
 * Each is fetched in parallel and isolated: a service that is down, slow or
 * missing its key resolves to {ok:false, error} and the other five still
 * render. Nothing here can throw a 500 — a flaky qBittorrent must never blank
 * the page.
 *
 * READ-ONLY. No mutating call exists in this path.
 */
export interface MediaData {
  jellyfin: ServiceResult<any>;
  sonarr: ServiceResult<any>;
  radarr: ServiceResult<any>;
  prowlarr: ServiceResult<any>;
  qbittorrent: ServiceResult<any>;
  seerr: ServiceResult<any>;
}

// Short server-side cache over the whole assembled payload. /media fans out to
// six upstreams every poll; nothing on the page (library counts, queues,
// request lists) changes on a sub-10s timescale, so a brief cache cuts upstream
// load and smooths a slow/hanging upstream without any visible staleness.
//
// Degradation is preserved by construction: the payload is assembled exactly as
// before (per-service settle intact, one dead service = only its slice
// unavailable), and only THEN cached. A fresh assembly recomputes degradation
// each TTL, so caching can never turn one upstream failure into a whole-payload
// failure, nor freeze a recovered service as down. Auth state (the qBittorrent
// cookie) is never cached — only the display payload is.
interface MediaCache {
  at: number;
  body: { status: string; updatedAt: string; data: MediaData };
}
let cache: MediaCache | null = null;

// Overridable so the TTL is tunable/testable without a code change.
const MEDIA_TTL_MS = Number(process.env.MEDIA_TTL_MS) > 0
  ? Number(process.env.MEDIA_TTL_MS)
  : 15000;

export async function GET() {
  if (cache && Date.now() - cache.at < MEDIA_TTL_MS) {
    return NextResponse.json(cache.body);
  }

  const settle = async <T,>(p: Promise<ServiceResult<T>>): Promise<ServiceResult<T>> => {
    try {
      return await p;
    } catch {
      return { ok: false, data: null, error: "request failed" };
    }
  };

  const [jellyfin, sonarr, radarr, prowlarr, qbittorrent, seerr] = await Promise.all([
    settle(fetchJellyfin()),
    settle(fetchSonarr()),
    settle(fetchRadarr()),
    settle(fetchProwlarr()),
    settle(fetchQbittorrent()),
    settle(fetchSeerr())
  ]);

  const body = {
    status: "ok",
    updatedAt: new Date().toISOString(),
    data: { jellyfin, sonarr, radarr, prowlarr, qbittorrent, seerr }
  };
  cache = { at: Date.now(), body };
  return NextResponse.json(body);
}
