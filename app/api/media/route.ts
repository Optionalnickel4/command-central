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

export async function GET() {
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

  return NextResponse.json({
    status: "ok",
    updatedAt: new Date().toISOString(),
    data: { jellyfin, sonarr, radarr, prowlarr, qbittorrent, seerr }
  });
}
