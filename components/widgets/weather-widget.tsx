"use client";

import { useWidgetData } from "@/lib/fetcher";
import { SampleTag } from "@/components/widgets/sample-tag";
import type { WeatherData } from "@/app/api/widgets/weather/route";

export default function WeatherWidget() {
  const { data, mock } = useWidgetData<WeatherData>("/api/widgets/weather", 10 * 60000);
  return (
    <div className="hud-panel depth-mid p-4 h-full">
      <div className="flex items-center justify-between mb-2">
        <p className="font-mono text-[9.5px] uppercase tracking-[0.28em] text-cyan-500/60">Weather</p>
        {mock && <SampleTag />}
      </div>
      <p className="font-display text-4xl font-semibold hud-glow-text leading-none tabular-nums">
        {data ? `${data.tempF}°` : "—"}
      </p>
      <p className="font-mono text-[11px] text-slate-400 mt-2">
        {data ? `${data.location} · ${data.condition}` : "…"}
      </p>
    </div>
  );
}
