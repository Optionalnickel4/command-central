"use client";

import { useWidgetData } from "@/lib/fetcher";
import type { CalendarData } from "@/app/api/widgets/calendar/route";

/**
 * Three states, deliberately distinct: real events, "not connected" (the three
 * GOOGLE_CALENDAR_* vars aren't all set — a setup step, with the link that
 * starts it) and "unavailable" (connected, but Google didn't answer). Only the
 * last is an alarm.
 */
export default function CalendarWidget() {
  const { data, status, error } = useWidgetData<CalendarData>("/api/widgets/calendar", 5 * 60000);

  const failed = Boolean(error) || status === "error";
  const unconnected = data?.configured === false;

  return (
    <div className="hud-panel depth-mid p-4 h-full">
      <div className="flex items-center justify-between mb-2.5">
        <p className="font-mono text-[9.5px] uppercase tracking-[0.28em] text-cyan-500/60">Next Up</p>
      </div>

      {unconnected ? (
        <p className="font-mono text-[11px] text-slate-500 leading-relaxed">
          Not connected —{" "}
          <a href="/api/calendar/connect" className="text-cyan-400/70 hover:text-cyan-300 underline underline-offset-2">
            link Google Calendar
          </a>
          .
        </p>
      ) : failed ? (
        <p className="font-mono text-[11px] hud-glow-red">Unavailable — Google Calendar unreachable</p>
      ) : (
        <>
          {!data && <p className="font-mono text-xs text-slate-500">…</p>}
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
    </div>
  );
}
