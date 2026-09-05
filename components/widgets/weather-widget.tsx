"use client";

import { useWidgetData } from "@/lib/fetcher";
import type { WeatherData } from "@/app/api/widgets/weather/route";
import { PanelEmpty, PanelFailure, PanelFrame, PanelSkeleton, PanelTitle } from "./panel-state";

/**
 * Three states, deliberately distinct: a live reading, "not configured" (no
 * WEATHER_LAT/WEATHER_LON — a setup step, not a fault) and "unavailable"
 * (configured, but Open-Meteo didn't answer). Only the last is an alarm.
 */
export default function WeatherWidget() {
  const { data, status, error, updatedAt, freshness } = useWidgetData<WeatherData>("/api/widgets/weather", 10 * 60000);

  const failed = Boolean(error) || status === "error";
  const unconfigured = data?.configured === false;
  // "Feels like" only earns its space when it actually diverges from the
  // reading — otherwise it's the same number twice.
  const feels =
    data?.tempF != null && data.feelsLikeF != null && Math.abs(data.feelsLikeF - data.tempF) >= 3
      ? `${data.feelsLikeF}°`
      : null;

  return (
    <PanelFrame>
      <PanelTitle state={unconfigured ? "not_configured" : failed ? (data ? "stale" : "down") : freshness === "stale" ? "stale" : "healthy"} updatedAt={updatedAt}>Weather</PanelTitle>

      {unconfigured ? (
        <PanelEmpty>
          Not configured — set <span className="text-cyan-500/60">WEATHER_LAT</span> /{" "}
          <span className="text-cyan-500/60">WEATHER_LON</span>.
        </PanelEmpty>
      ) : failed ? (
        <PanelFailure source="weather" stale={Boolean(data)} />
      ) : !data ? (
        <PanelSkeleton label="Loading weather" />
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
    </PanelFrame>
  );
}
