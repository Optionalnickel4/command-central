"use client";

import { useWidgetData } from "@/lib/fetcher";
import type { CalendarData } from "@/app/api/widgets/calendar/route";

export default function CalendarWidget() {
  const { data } = useWidgetData<CalendarData>("/api/widgets/calendar", 5 * 60000);
  return (
    <div className="hud-panel depth-mid p-4 h-full">
      <p className="font-mono text-[9.5px] uppercase tracking-[0.28em] text-cyan-500/60 mb-2.5">Next Up</p>
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
    </div>
  );
}
