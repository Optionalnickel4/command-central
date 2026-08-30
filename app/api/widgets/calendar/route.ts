import { NextResponse } from "next/server";
import type { WidgetResponse } from "@/components/widgets/types";
import {
  calendarLimit, fetchUpcomingEvents, hasCalendarConfig, mapEvents, type CalendarEvent
} from "@/lib/google-calendar";
import { UPSTREAM_UNAVAILABLE, configStatus } from "@/lib/response-status";

// Keeps this route server-rendered per request; without it Next prerenders
// the GET at build time and the panel freezes on build-time data.
export const dynamic = "force-dynamic";

export interface CalendarData {
  events: CalendarEvent[];
  /**
   * False until all three GOOGLE_CALENDAR_* vars are set — the pre-connect
   * state, which reads as "connect me" rather than as a failure. True once
   * connected, including when the fetch then fails.
   */
  configured: boolean;
}

/** A calendar doesn't change second to second, and every poll costs a Google call. */
const TTL_MS = Number(process.env.CALENDAR_TTL_MS) > 0
  ? Number(process.env.CALENDAR_TTL_MS)
  : 10 * 60 * 1000;

let cache: { at: number; payload: WidgetResponse<CalendarData> } | null = null;

// Not connected yet is config-absent, not an outage: 404 with a body the panel
// renders as "not connected". A 500 here would look like a fault when the only
// thing missing is a setup step.
function notConnected(): NextResponse {
  return NextResponse.json(
    {
      status: "error",
      updatedAt: new Date().toISOString(),
      data: { events: [], configured: false }
    } satisfies WidgetResponse<CalendarData>,
    { status: configStatus(false) }
  );
}

// Google is this route's only source, so a failed call leaves nothing to
// render: 503, with the WidgetResponse body kept so the panel shows its own
// "unavailable" state rather than a bare transport error.
function fail(): NextResponse {
  return NextResponse.json(
    {
      status: "error",
      updatedAt: new Date().toISOString(),
      data: { events: [], configured: true }
    } satisfies WidgetResponse<CalendarData>,
    { status: UPSTREAM_UNAVAILABLE }
  );
}

export async function GET() {
  if (!hasCalendarConfig()) return notConnected();

  if (cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json(cache.payload);
  }

  try {
    const now = new Date();
    const { items, timeZone } = await fetchUpcomingEvents(now);
    const payload: WidgetResponse<CalendarData> = {
      status: "ok",
      updatedAt: now.toISOString(),
      data: { events: mapEvents(items, now, timeZone, calendarLimit()), configured: true }
    };
    cache = { at: Date.now(), payload };
    return NextResponse.json(payload);
  } catch (err) {
    // Status only — a Google token error body can echo the credential back.
    console.error("calendar fetch failed:", err instanceof Error ? err.message : err);
    return fail();
  }
}
