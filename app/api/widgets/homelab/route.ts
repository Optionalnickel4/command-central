import { NextResponse } from "next/server";
import type { WidgetResponse } from "@/components/widgets/types";
// The shaping lives in lib/homelab.ts so the assistant's context snapshot can
// call it directly instead of fetching this route over loopback (a self-fetch
// carries no Access JWT and is 401'd by the auth layer). Underneath it is still
// the https-module PVE client — NOT fetch/undici (CLAUDE.md rule 1).
import { fetchHomelab, type HomelabData } from "@/lib/homelab";
import { hasPveCredentials } from "@/lib/pve";
import { UPSTREAM_UNAVAILABLE } from "@/lib/response-status";

// Without this Next prerenders this GET at build time and the panel serves
// frozen build-time telemetry forever.
export const dynamic = "force-dynamic";

// The panels import this type from the route, as they do for every widget.
export type { HomelabData };

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
    const data = await fetchHomelab();
    return NextResponse.json({
      status: "ok", updatedAt: new Date().toISOString(), data
    } satisfies WidgetResponse<HomelabData>);
  } catch (err) {
    console.error("homelab PVE fetch failed:", err instanceof Error ? err.message : err);
    return unavailable();
  }
}
