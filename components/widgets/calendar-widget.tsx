"use client";

import { useWidgetData } from "@/lib/fetcher";
import type { CalendarData } from "@/app/api/widgets/calendar/route";
import { PanelEmpty, PanelFailure, PanelFrame, PanelSkeleton, PanelTitle } from "./panel-state";

/**
 * Three states, deliberately distinct: real events, "not connected" (the three
 * GOOGLE_CALENDAR_* vars aren't all set — a setup step, with the link that
 * starts it) and "unavailable" (connected, but Google didn't answer). Only the
 * last is an alarm.
 */
export default function CalendarWidget() {
  const { data, status, error, updatedAt, freshness } = useWidgetData<CalendarData>("/api/widgets/calendar", 5 * 60000);

  const failed = Boolean(error) || status === "error";
  const unconnected = data?.configured === false;

  return (
    <PanelFrame>
      <PanelTitle state={unconnected ? "not_configured" : failed ? (data ? "stale" : "down") : freshness === "stale" ? "stale" : "healthy"} updatedAt={updatedAt}>Next Up</PanelTitle>

      {unconnected ? (
        <PanelEmpty>
          Not connected —{" "}
          <a href="/api/calendar/connect" className="text-cyan-400/70 hover:text-cyan-300 underline underline-offset-2">
            link Google Calendar
          </a>
          .
        </PanelEmpty>
      ) : failed ? (
        <PanelFailure source="calendar" stale={Boolean(data)} />
      ) : !data ? (
        <PanelSkeleton label="Loading calendar" />
      ) : (
        <>
          {data?.events.map((ev) => (
            <p
              key={ev.time + ev.title}
              className="font-mono text-[13px] text-slate-200 mb-2 flex gap-2.5 items-baseline border-l border-cyan-500/25 pl-2.5"
            >
              <span className="hud-glow-text tabular-nums shrink-0">{ev.time}</span>
              <span className="truncate">{ev.title}</span>
            </p>
          ))}
          {data?.events.length === 0 && (
            <p className="font-mono text-xs text-slate-500">Nothing scheduled.</p>
          )}
        </>
      )}
    </PanelFrame>
  );
}
