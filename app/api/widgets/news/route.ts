import { NextResponse } from "next/server";
import type { WidgetResponse } from "@/components/widgets/types";

// Keeps this route server-rendered per request; without it Next prerenders
// the GET at build time and the panel freezes on build-time data.
export const dynamic = "force-dynamic";

export interface NewsData {
  headlines: string[];
}

// TODO wire real data: any news API keyed by NEWS_API_KEY, filtered to
// NEWS_TOPICS (tech, gaming). Keep this route as the only place that
// talks to the provider so the topic list can change without touching
// the widget component.
export async function GET() {
  const body: WidgetResponse<NewsData> = {
    status: "ok",
    // Honest flag: this payload is hardcoded placeholder, not a live source.
    mock: true,
    updatedAt: new Date().toISOString(),
    data: {
      headlines: ["New GPU driver release fixes stutter", "Indie title tops the weekend charts"]
    }
  };
  return NextResponse.json(body);
}
