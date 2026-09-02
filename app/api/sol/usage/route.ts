import { NextResponse } from "next/server";
import type { WidgetResponse } from "@/components/widgets/types";
import { INTERNAL_ERROR } from "@/lib/response-status";
// The roll-up lives in lib/usage-log.ts, shared with the assistant's context
// snapshot, which calls it rather than fetching this route over loopback
// (a self-fetch carries no Access JWT and is 401'd by the auth layer).
import { EMPTY_SOL_USAGE, fetchSolUsage, type SolUsageData } from "@/lib/usage-log";

export const dynamic = "force-dynamic";

// The panels import this type from the route, as they do for every widget.
export type { SolUsageData };

export async function GET() {
  try {
    return NextResponse.json({
      status: "ok", updatedAt: new Date().toISOString(), data: await fetchSolUsage()
    } satisfies WidgetResponse<SolUsageData>);
  } catch (err) {
    console.error("sol usage failed:", err instanceof Error ? err.message : err);
    // 500, not 503: this route reads a local log file, so a failure here is
    // ours rather than some upstream's. The reason stays in the server log.
    return NextResponse.json(
      { status: "error", updatedAt: new Date().toISOString(), data: EMPTY_SOL_USAGE } satisfies WidgetResponse<SolUsageData>,
      { status: INTERNAL_ERROR }
    );
  }
}
