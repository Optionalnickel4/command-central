/**
 * Server-side client for Open-Meteo (the weather panel's source).
 *
 * Open-Meteo needs no API key and no signup — the only configuration is the
 * coordinate pair, so "not configured" here means WEATHER_LAT/WEATHER_LON are
 * missing or unparseable, nothing more.
 *
 * Plain fetch is correct: this is public HTTPS with a normal cert story. The
 * Node-https rule in CLAUDE.md is specific to Proxmox's self-signed endpoint.
 *
 * The shaping half (the WMO code table) is pure and separated from the
 * transport so it can be unit-tested without reaching the network.
 */

const ENDPOINT = "https://api.open-meteo.com/v1/forecast";

/**
 * WMO 4677 present-weather codes, as documented by Open-Meteo, mapped to the
 * short strings the panel shows. Grouped intensities are kept distinct
 * ("Heavy rain" vs "Light rain") because that is the part a glance at the
 * panel actually uses.
 */
export const WMO_CONDITIONS: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Freezing drizzle",
  57: "Heavy freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Heavy freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Light showers",
  81: "Showers",
  82: "Violent showers",
  85: "Light snow showers",
  86: "Snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm, hail",
  99: "Thunderstorm, heavy hail"
};

/**
 * A WMO code as a condition string. Unknown or absent codes fall back to
 * "Unknown" rather than inventing a condition — the temperature is still
 * worth showing when only the code is unrecognised.
 */
export function conditionFor(code: unknown): string {
  return typeof code === "number" && WMO_CONDITIONS[code] ? WMO_CONDITIONS[code] : "Unknown";
}

/** A coordinate is only usable if it parses AND lies in range. */
function coord(raw: string | undefined, limit: number): number | null {
  if (!raw || !raw.trim()) return null;
  const n = Number(raw);
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
}

export interface WeatherCoords {
  lat: number;
  lon: number;
}

/** The configured coordinates, or null when unset/unparseable. */
export function weatherCoords(): WeatherCoords | null {
  const lat = coord(process.env.WEATHER_LAT, 90);
  const lon = coord(process.env.WEATHER_LON, 180);
  return lat === null || lon === null ? null : { lat, lon };
}

/**
 * The label under the temperature. Open-Meteo returns coordinates, not a place
 * name, so an explicit label is the only honest way to show one — without it
 * the panel shows the coordinates rather than claiming a city it wasn't told.
 */
export function weatherLabel(coords: WeatherCoords): string {
  const label = process.env.WEATHER_LOCATION?.trim();
  return label || `${coords.lat.toFixed(2)}, ${coords.lon.toFixed(2)}`;
}

export interface CurrentWeather {
  tempF: number | null;
  feelsLikeF: number | null;
  condition: string;
}

/** Shape one Open-Meteo `current` block. Pure — the fetch is separate. */
export function normalizeCurrent(payload: unknown): CurrentWeather {
  const current = (payload as { current?: Record<string, unknown> } | null)?.current;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);
  return {
    tempF: num(current?.temperature_2m),
    feelsLikeF: num(current?.apparent_temperature),
    condition: conditionFor(current?.weather_code)
  };
}

/** Fetch the current conditions. Throws on any failure; the route degrades. */
export async function fetchCurrentWeather(
  coords: WeatherCoords,
  timeoutMs = 8000
): Promise<CurrentWeather> {
  const url =
    `${ENDPOINT}?latitude=${coords.lat}&longitude=${coords.lon}` +
    "&current=temperature_2m,weather_code,apparent_temperature" +
    "&temperature_unit=fahrenheit";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: { accept: "application/json" }
    });
    if (!res.ok) throw new Error(`open-meteo -> ${res.status}`);
    const shaped = normalizeCurrent(await res.json());
    // A 200 with no usable temperature is a bad upstream reply, not a reading.
    if (shaped.tempF === null) throw new Error("open-meteo returned no temperature");
    return shaped;
  } finally {
    clearTimeout(timer);
  }
}
