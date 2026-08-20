import { NextResponse } from "next/server";
import type { WidgetResponse } from "@/components/widgets/types";

// Keeps this route server-rendered per request; without it Next prerenders
// the GET at build time and the panel freezes on build-time data.
export const dynamic = "force-dynamic";

export interface WeatherData {
  tempF: number;
  condition: string;
  location: string;
}

// TODO wire real data: open-meteo.com needs no API key — fetch
// `https://api.open-meteo.com/v1/forecast?latitude=${WEATHER_LAT}&longitude=${WEATHER_LON}&current=temperature_2m,weather_code`
// and map the WMO weather code to a condition string.
export async function GET() {
  const body: WidgetResponse<WeatherData> = {
    status: "ok",
    updatedAt: new Date().toISOString(),
    data: { tempF: 72, condition: "Partly cloudy", location: "Philadelphia" }
  };
  return NextResponse.json(body);
}
