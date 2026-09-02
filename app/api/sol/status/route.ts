import { NextResponse } from "next/server";
import type { WidgetResponse } from "@/components/widgets/types";
import { UPSTREAM_UNAVAILABLE } from "@/lib/response-status";
// Shaping lives in lib/sol-status.ts, shared with the assistant's context
// snapshot, which calls it rather than fetching this route over loopback
// (a self-fetch carries no Access JWT and is 401'd by the auth layer).
import { EMPTY_SOL_STATUS, fetchSolStatus, type SolStatusData } from "@/lib/sol-status";

export const dynamic = "force-dynamic";

// The panels import this type from the route, as they do for every widget.
export type { SolStatusData };

export async function GET() {
  try {
    return NextResponse.json({
      status: "ok", updatedAt: new Date().toISOString(), data: await fetchSolStatus()
    } satisfies WidgetResponse<SolStatusData>);
  } catch (err) {
    console.error("sol status failed:", err instanceof Error ? err.message : err);
    // cc-stats on 152 is the only source here, so a failed call is a failed
    // response — 503, with the body shape kept so the panel degrades as before.
    return NextResponse.json(
      { status: "error", updatedAt: new Date().toISOString(), data: EMPTY_SOL_STATUS } satisfies WidgetResponse<SolStatusData>,
      { status: UPSTREAM_UNAVAILABLE }
    );
  }
}
