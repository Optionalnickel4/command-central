/**
 * Server-side Google Calendar client — read-only.
 *
 * Three env vars configure it: GOOGLE_CALENDAR_CLIENT_ID and _CLIENT_SECRET
 * come from the Google Cloud console, and _REFRESH_TOKEN is minted once by the
 * in-app connect flow (app/api/calendar/connect -> /callback). Until all three
 * are set the panel shows "not connected", which is a setup step, not a fault.
 *
 * SECRETS: the client secret and the refresh token never leave this process
 * except in the two calls to Google's token endpoint. Nothing here logs them,
 * and the error paths deliberately report only the HTTP status — a Google token
 * error body can echo the credential back.
 *
 * The scope is calendar.readonly and there is no write path anywhere in this
 * module: this is a display panel, not calendar management.
 */

/**
 * Name of the short-lived cookie holding the CSRF state across the OAuth round
 * trip. Lives here rather than in the connect route because a Next route module
 * may only export its handlers and route config — both routes read it from here.
 */
export const STATE_COOKIE = "cc_gcal_state";

/** Read-only. Deliberately the narrowest scope that can list events. */
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

/**
 * Must match the "Authorized redirect URI" registered on the OAuth client
 * character-for-character — https, no trailing slash — or Google refuses the
 * exchange with redirect_uri_mismatch. Overridable for a differently-hosted
 * clone, but the default is this deployment's real callback.
 */
export const REDIRECT_URI =
  process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim() ||
  "https://jarvis.jushosting.dev/api/calendar/callback";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const EVENTS_ENDPOINT = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

function env(name: string): string | null {
  const v = process.env[name]?.trim();
  return v ? v : null;
}

/** Enough to START the OAuth flow: the client half, minted in the console. */
export function hasOAuthClient(): boolean {
  return Boolean(env("GOOGLE_CALENDAR_CLIENT_ID") && env("GOOGLE_CALENDAR_CLIENT_SECRET"));
}

/** Enough to READ the calendar: the client half plus a minted refresh token. */
export function hasCalendarConfig(): boolean {
  return hasOAuthClient() && Boolean(env("GOOGLE_CALENDAR_REFRESH_TOKEN"));
}

/**
 * The consent URL the connect route sends the user to.
 *
 * access_type=offline and prompt=consent are the whole point: without BOTH,
 * Google returns only a one-hour access token and no refresh token, and the
 * flow appears to succeed while producing nothing durable to put in .env.local.
 * prompt=consent is needed because Google omits the refresh token on repeat
 * authorisations — so a second run of this flow would otherwise come back empty.
 */
export function buildAuthUrl(state: string): string {
  const clientId = env("GOOGLE_CALENDAR_CLIENT_ID");
  if (!clientId) throw new Error("GOOGLE_CALENDAR_CLIENT_ID is not set");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: CALENDAR_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

/**
 * Exchange the callback's ?code= for tokens. Returns the refresh token for the
 * user to paste into .env.local — this is the only place it ever surfaces, and
 * it is never written to disk or logged.
 */
export async function exchangeCode(code: string, timeoutMs = 10000): Promise<{
  refreshToken: string | null;
  scope: string | null;
}> {
  const clientId = env("GOOGLE_CALENDAR_CLIENT_ID");
  const clientSecret = env("GOOGLE_CALENDAR_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("OAuth client is not configured");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      cache: "no-store",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code"
      })
    });
    // Status only: a token-endpoint error body can echo the credential back.
    if (!res.ok) throw new Error(`google token exchange -> ${res.status}`);
    const json = (await res.json()) as { refresh_token?: string; scope?: string };
    return { refreshToken: json.refresh_token ?? null, scope: json.scope ?? null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Access tokens last an hour; minting one per poll would be pointless traffic
 * against Google's token endpoint. Held in memory only — never persisted.
 */
let accessToken: { value: string; expiresAt: number } | null = null;

/** A valid access token, refreshed from the refresh token when needed. */
export async function getAccessToken(timeoutMs = 10000): Promise<string> {
  if (accessToken && Date.now() < accessToken.expiresAt) return accessToken.value;

  const clientId = env("GOOGLE_CALENDAR_CLIENT_ID");
  const clientSecret = env("GOOGLE_CALENDAR_CLIENT_SECRET");
  const refreshToken = env("GOOGLE_CALENDAR_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) throw new Error("calendar is not configured");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      cache: "no-store",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token"
      })
    });
    // Status only — see exchangeCode.
    if (!res.ok) throw new Error(`google token refresh -> ${res.status}`);
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) throw new Error("google token refresh returned no access_token");

    const ttl = typeof json.expires_in === "number" ? json.expires_in : 3600;
    // A minute of margin so a token can't expire mid-request.
    accessToken = { value: json.access_token, expiresAt: Date.now() + (ttl - 60) * 1000 };
    return accessToken.value;
  } finally {
    clearTimeout(timer);
  }
}

/** One event as the Calendar API returns it, trimmed to what the panel reads. */
export interface GoogleEvent {
  summary?: string;
  status?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
}

export interface CalendarEvent {
  /** Display label: "14:30" today, "Tue 14:30" later, "All day" / "Tue" for all-day. */
  time: string;
  title: string;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Today's date, as YYYY-MM-DD, in the calendar's own timezone. */
export function dateKeyIn(now: Date, timeZone: string): string {
  try {
    // en-CA renders as YYYY-MM-DD, which is exactly the key shape wanted.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(now);
  } catch {
    // An unknown timeZone from the API must not take the panel down.
    return now.toISOString().slice(0, 10);
  }
}

/**
 * The date and wall-clock time of an event, read straight off the RFC3339
 * string rather than through a Date.
 *
 * This is deliberate: Google stamps `dateTime` with the calendar's own UTC
 * offset ("2026-08-31T10:00:00-04:00"), so the characters already ARE the local
 * time the user sees in Google Calendar. Parsing to a Date and reformatting
 * would re-render it in the SERVER's timezone — 220 runs UTC, so a 10:00
 * Philadelphia meeting would show as 14:00.
 */
export function splitStart(start: GoogleEvent["start"]): { date: string; time: string | null } | null {
  const dateTime = typeof start?.dateTime === "string" ? start.dateTime : null;
  if (dateTime) {
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(dateTime);
    return m ? { date: m[1], time: m[2] } : null;
  }
  // All-day events carry `date` and no time at all.
  const date = typeof start?.date === "string" ? start.date : null;
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? { date, time: null } : null;
}

/** Short weekday for a plain YYYY-MM-DD, computed in UTC so no zone shifts it. */
export function weekdayFor(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return WEEKDAYS[day] ?? "";
}

/**
 * Shape the API's items into what the panel renders. Pure — takes the items,
 * "now" and the calendar's timezone rather than reading the clock itself.
 *
 * Events on a later day are prefixed with their weekday, because a bare "09:00"
 * in a list spanning a week is ambiguous. Cancelled events and events with no
 * usable start are dropped; an untitled event becomes "(no title)" rather than
 * rendering as a blank row.
 */
export function mapEvents(
  items: unknown,
  now: Date,
  timeZone: string,
  limit: number
): CalendarEvent[] {
  if (!Array.isArray(items)) return [];
  const todayKey = dateKeyIn(now, timeZone);

  const out: CalendarEvent[] = [];
  for (const raw of items as GoogleEvent[]) {
    if (raw?.status === "cancelled") continue;
    const start = splitStart(raw?.start);
    if (!start) continue;

    const isToday = start.date === todayKey;
    let label: string;
    if (start.time === null) {
      label = isToday ? "All day" : weekdayFor(start.date);
    } else {
      label = isToday ? start.time : `${weekdayFor(start.date)} ${start.time}`;
    }

    const title = typeof raw?.summary === "string" ? raw.summary.replace(/\s+/g, " ").trim() : "";
    out.push({ time: label, title: title || "(no title)" });
    if (out.length >= limit) break;
  }
  return out;
}

/** How many events the panel shows, and how far ahead to look. */
export function calendarLimit(): number {
  const n = Number(process.env.CALENDAR_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 5;
}

export function calendarDays(): number {
  const n = Number(process.env.CALENDAR_DAYS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 7;
}

/**
 * Fetch upcoming events from the primary calendar. Throws on any failure; the
 * route catches and degrades.
 *
 * singleEvents=true expands recurring events into occurrences and is REQUIRED
 * for orderBy=startTime — without it Google rejects the ordering and a weekly
 * standup would appear once, at its series start, instead of on Monday.
 */
export async function fetchUpcomingEvents(
  now: Date,
  timeoutMs = 10000
): Promise<{ items: unknown; timeZone: string }> {
  const token = await getAccessToken();

  const timeMax = new Date(now.getTime() + calendarDays() * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    // Ask for more than the panel shows: cancelled and unusable entries are
    // filtered out after the fact, and shouldn't leave the panel short.
    maxResults: String(calendarLimit() * 4)
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${EVENTS_ENDPOINT}?${params.toString()}`, {
      signal: controller.signal,
      cache: "no-store",
      headers: { authorization: `Bearer ${token}`, accept: "application/json" }
    });
    if (!res.ok) throw new Error(`google calendar events -> ${res.status}`);
    const json = (await res.json()) as { items?: unknown; timeZone?: string };
    return { items: json.items ?? [], timeZone: json.timeZone || "UTC" };
  } finally {
    clearTimeout(timer);
  }
}
