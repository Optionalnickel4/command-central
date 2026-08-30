"use client";

import { useWidgetData } from "@/lib/fetcher";
import type { WeatherData } from "@/app/api/widgets/weather/route";

/**
 * Three states, deliberately distinct: a live reading, "not configured" (no
 * WEATHER_LAT/WEATHER_LON — a setup step, not a fault) and "unavailable"
 * (configured, but Open-Meteo didn't answer). Only the last is an alarm.
 */
export default function WeatherWidget() {
  const { data, status, error } = useWidgetData<WeatherData>("/api/widgets/weather", 10 * 60000);

  const failed = Boolean(error) || status === "error";
  const unconfigured = data?.configured === false;
  // "Feels like" only earns its space when it actually diverges from the
  // reading — otherwise it's the same number twice.
  const feels =
    data?.tempF != null && data.feelsLikeF != null && Math.abs(data.feelsLikeF - data.tempF) >= 3
      ? `${data.feelsLikeF}°`
      : null;

  return (
    <div className="hud-panel depth-mid p-4 h-full">
      <div className="flex items-center justify-between mb-2">
        <p className="font-mono text-[9.5px] uppercase tracking-[0.28em] text-cyan-500/60">Weather</p>
      </div>

      {unconfigured ? (
        <p className="font-mono text-[11px] text-slate-500 leading-relaxed">
          Not configured — set <span className="text-cyan-500/60">WEATHER_LAT</span> /{" "}
          <span className="text-cyan-500/60">WEATHER_LON</span>.
        </p>
      ) : failed ? (
        <p className="font-mono text-[11px] hud-glow-red">Unavailable — open-meteo unreachable</p>
      ) : (
        <>
          <p className="font-display text-4xl font-semibold hud-glow-text leading-none tabular-nums">
            {data?.tempF != null ? `${data.tempF}°` : "—"}
          </p>
          <p className="font-mono text-[11px] text-slate-400 mt-2">
            {data ? `${data.location} · ${data.condition}` : "…"}
            {feels && <span className="text-slate-500"> · feels {feels}</span>}
          </p>
        </>
      )}
    </div>
  );
}
