import { NextResponse } from "next/server";
import type { WidgetResponse } from "@/components/widgets/types";
// Shaping and the 12s fan-out cache live in lib/homelab.ts, shared with the
// assistant's context snapshot, which calls the function rather than fetching
// this route over loopback (that self-fetch carries no Access JWT and 401s).
import { EMPTY_DETAIL, fetchHomelabDetail, type HomelabDetailData } from "@/lib/homelab";
import { hasPveCredentials } from "@/lib/pve";
import { UPSTREAM_UNAVAILABLE } from "@/lib/response-status";

// Heavy companion to /api/widgets/homelab. That route stays light (one
// cluster/resources call) and drives the gauges at 15s; this one fans out
// per-guest detail calls and is polled at 30s.
export const dynamic = "force-dynamic";

// The panels import these types from the route, as they do for every widget.
export type { GuestDetail, NodeDetail, HomelabDetailData } from "@/lib/homelab";

// Same single-source rule as the light route: no cluster/resources call, no
// response. Per-GUEST failures inside a successful fan-out are different — those
// degrade that guest only and stay 200.
const unavailable = () =>
  NextResponse.json(
    { status: "error", updatedAt: new Date().toISOString(), data: EMPTY_DETAIL } satisfies WidgetResponse<HomelabDetailData>,
    { status: UPSTREAM_UNAVAILABLE }
  );

export async function GET() {
  if (!hasPveCredentials()) return unavailable();

  try {
    const detail = await fetchHomelabDetail();
    // updatedAt is when the fan-out actually ran, not when it was asked for —
    // a cache hit must not claim to be fresher than the numbers it carries.
    return NextResponse.json({
      status: "ok", updatedAt: detail.fetchedAt, data: detail.data
    } satisfies WidgetResponse<HomelabDetailData>);
  } catch (err) {
    console.error("homelab detail fetch failed:", err instanceof Error ? err.message : err);
    return unavailable();
  }
}
