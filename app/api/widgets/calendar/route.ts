import { NextResponse } from "next/server";
import type { WidgetResponse } from "@/components/widgets/types";

// Keeps this route server-rendered per request; without it Next prerenders
// the GET at build time and the panel freezes on build-time data.
export const dynamic = "force-dynamic";

export interface CalendarData {
  events: { time: string; title: string }[];
}

// TODO wire real data: use GOOGLE_CALENDAR_CLIENT_ID/SECRET/REFRESH_TOKEN
// with the Google Calendar API (events.list on the primary calendar,
// timeMin=now, orderBy=startTime, maxResults=5).
export async function GET() {
  const body: WidgetResponse<CalendarData> = {
    status: "ok",
    updatedAt: new Date().toISOString(),
    data: {
      events: [
        { time: "10:00", title: "Standup" },
        { time: "14:30", title: "Dentist" }
      ]
    }
  };
  return NextResponse.json(body);
}
