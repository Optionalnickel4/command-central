import { NextResponse } from "next/server";
import type { WidgetResponse } from "@/components/widgets/types";
import { fetchCurrentWeather, weatherCoords, weatherLabel } from "@/lib/weather";
import { UPSTREAM_UNAVAILABLE, configStatus } from "@/lib/response-status";

// Keeps this route server-rendered per request; without it Next prerenders
// the GET at build time and the panel freezes on build-time data.
export const dynamic = "force-dynamic";

export interface WeatherData {
  tempF: number | null;
  /** Apparent ("feels like") temperature; the panel shows it only when it diverges. */
  feelsLikeF: number | null;
  condition: string;
  location: string;
  /**
   * False when WEATHER_LAT/WEATHER_LON are unset — the pre-setup state, which
   * reads as "configure me" rather than as a failure. True once configured,
   * including when the fetch then fails.
   */
  configured: boolean;
}

/**
 * Open-Meteo's current block updates on a 15-minute interval, so polling it
 * harder than that buys nothing and is impolite to a free, keyless service.
 * Overridable so diagnostics don't have to wait ten minutes for a refresh.
 */
const TTL_MS = Number(process.env.WEATHER_TTL_MS) > 0
  ? Number(process.env.WEATHER_TTL_MS)
  : 10 * 60 * 1000;

let cache: { at: number; payload: WidgetResponse<WeatherData> } | null = null;

const empty = (configured: boolean): WeatherData => ({
  tempF: null,
  feelsLikeF: null,
  condition: "Unknown",
  location: "",
  configured
});

// Open-Meteo is this route's only source, so a failed call leaves nothing to
// render: 503, with the WidgetResponse body kept so the panel still shows its
// own "unavailable" state rather than a bare transport error. The unconfigured
// 404 below is separate — that is "not set up yet", not a failure.
function fail(): NextResponse {
  return NextResponse.json(
    {
      status: "error",
      updatedAt: new Date().toISOString(),
      data: empty(true)
    } satisfies WidgetResponse<WeatherData>,
    { status: UPSTREAM_UNAVAILABLE }
  );
}

// No coordinates is config-absent, not an outage: 404 with a body the panel
// renders as "not configured". A 503 here would claim something broke.
function notConfigured(): NextResponse {
  return NextResponse.json(
    {
      status: "error",
      updatedAt: new Date().toISOString(),
      data: empty(false)
    } satisfies WidgetResponse<WeatherData>,
    { status: configStatus(false) }
  );
}

export async function GET() {
  const coords = weatherCoords();
  if (!coords) return notConfigured();

  if (cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json(cache.payload);
  }

  try {
    const current = await fetchCurrentWeather(coords);
    const payload: WidgetResponse<WeatherData> = {
      status: "ok",
      updatedAt: new Date().toISOString(),
      data: { ...current, location: weatherLabel(coords), configured: true }
    };
    cache = { at: Date.now(), payload };
    return NextResponse.json(payload);
  } catch (err) {
    console.error("weather fetch failed:", err instanceof Error ? err.message : err);
    return fail();
  }
}
