import { afterEach, describe, expect, it } from "vitest";
import {
  CALENDAR_SCOPE, buildAuthUrl, calendarDays, calendarLimit, dateKeyIn, hasCalendarConfig,
  hasOAuthClient, mapEvents, splitStart, weekdayFor
} from "@/lib/google-calendar";
import { NOT_PRESENT, configStatus } from "@/lib/response-status";

/**
 * The pure half of the calendar source: the consent URL, the config gates and
 * the event mapping. The token exchange and the events fetch are deliberately
 * not exercised — they are transport, and testing them would mean holding a
 * real Google credential in the test suite.
 *
 * Fixtures use the shape the Calendar API returns: `start.dateTime` stamped
 * with the calendar's own UTC offset for timed events, `start.date` for all-day.
 */

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
});

function withClient() {
  process.env.GOOGLE_CALENDAR_CLIENT_ID = "cid.apps.googleusercontent.com";
  process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "shhh";
}

describe("buildAuthUrl — the refresh-token trap", () => {
  /**
   * The #1 way this flow fails silently: without access_type=offline AND
   * prompt=consent Google returns a one-hour access token and no refresh token,
   * so the mint "succeeds" and produces nothing durable. Both must be present.
   */
  it("sends access_type=offline and prompt=consent", () => {
    withClient();
    const params = new URL(buildAuthUrl("state123")).searchParams;
    expect(params.get("access_type")).toBe("offline");
    expect(params.get("prompt")).toBe("consent");
  });

  it("asks for the read-only scope and nothing wider", () => {
    withClient();
    const scope = new URL(buildAuthUrl("s")).searchParams.get("scope");
    expect(scope).toBe(CALENDAR_SCOPE);
    expect(scope).toMatch(/\.readonly$/);
    // No write scope may ever appear here — this is a display panel.
    expect(scope).not.toMatch(/auth\/calendar$/);
    expect(scope).not.toContain("calendar.events");
  });

  it("uses the exact registered redirect URI — https, no trailing slash", () => {
    withClient();
    const redirect = new URL(buildAuthUrl("s")).searchParams.get("redirect_uri");
    // Must match the OAuth client's Authorized redirect URI character for
    // character or Google answers redirect_uri_mismatch.
    expect(redirect).toBe("https://jarvis.jushosting.dev/api/calendar/callback");
    expect(redirect).not.toMatch(/\/$/);
  });

  it("carries the CSRF state through and asks for a code", () => {
    withClient();
    const params = new URL(buildAuthUrl("abc123")).searchParams;
    expect(params.get("state")).toBe("abc123");
    expect(params.get("response_type")).toBe("code");
    expect(params.get("client_id")).toBe("cid.apps.googleusercontent.com");
  });

  it("refuses to build a URL with no client id rather than sending a broken one", () => {
    delete process.env.GOOGLE_CALENDAR_CLIENT_ID;
    expect(() => buildAuthUrl("s")).toThrow();
  });

  it("never puts the client secret in the consent URL", () => {
    withClient();
    expect(buildAuthUrl("s")).not.toContain("shhh");
  });
});

describe("config gates", () => {
  it("separates 'can start the flow' from 'can read the calendar'", () => {
    withClient();
    delete process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
    // The state right after the console steps: connect works, reading doesn't.
    expect(hasOAuthClient()).toBe(true);
    expect(hasCalendarConfig()).toBe(false);

    process.env.GOOGLE_CALENDAR_REFRESH_TOKEN = "1//refresh";
    expect(hasCalendarConfig()).toBe(true);
  });

  it("treats blank vars as unset — an empty placeholder is not configuration", () => {
    process.env.GOOGLE_CALENDAR_CLIENT_ID = "";
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "   ";
    process.env.GOOGLE_CALENDAR_REFRESH_TOKEN = "";
    expect(hasOAuthClient()).toBe(false);
    expect(hasCalendarConfig()).toBe(false);
  });

  it("needs all three — any one missing is not connected", () => {
    const names = [
      "GOOGLE_CALENDAR_CLIENT_ID",
      "GOOGLE_CALENDAR_CLIENT_SECRET",
      "GOOGLE_CALENDAR_REFRESH_TOKEN"
    ];
    for (const missing of names) {
      withClient();
      process.env.GOOGLE_CALENDAR_REFRESH_TOKEN = "1//refresh";
      delete process.env[missing];
      expect(hasCalendarConfig(), `missing ${missing}`).toBe(false);
    }
  });

  it("answers 404, never a 5xx, before the flow is run", () => {
    expect(configStatus(false)).toBe(NOT_PRESENT);
    expect(configStatus(false)).toBeLessThan(500);
  });
});

describe("splitStart — reading the wall clock off the RFC3339 string", () => {
  /**
   * The timezone trap this guards: Google stamps dateTime with the CALENDAR's
   * offset, so the characters already are the local time. 220 runs UTC, so
   * parsing to a Date and reformatting would show a 10:00 Philadelphia meeting
   * as 14:00.
   */
  it("keeps the local wall time, not the UTC equivalent", () => {
    expect(splitStart({ dateTime: "2026-08-31T10:00:00-04:00" })).toEqual({
      date: "2026-08-31",
      time: "10:00"
    });
  });

  it("does the same for a positive offset and for a Z stamp", () => {
    expect(splitStart({ dateTime: "2026-08-31T09:30:00+02:00" })?.time).toBe("09:30");
    expect(splitStart({ dateTime: "2026-08-31T23:15:00Z" })?.time).toBe("23:15");
  });

  it("reads an all-day event as a date with no time", () => {
    expect(splitStart({ date: "2026-09-01" })).toEqual({ date: "2026-09-01", time: null });
  });

  it("returns null for a start it cannot read instead of guessing", () => {
    for (const junk of [undefined, {}, { dateTime: "nonsense" }, { date: "31/08/2026" }]) {
      expect(splitStart(junk as never)).toBeNull();
    }
  });
});

describe("weekdayFor", () => {
  it("names the day without letting a timezone shift it", () => {
    // 2026-08-31 is a Monday; computed in UTC so a UTC-running box can't
    // roll a midnight-adjacent date back a day.
    expect(weekdayFor("2026-08-31")).toBe("Mon");
    expect(weekdayFor("2026-09-01")).toBe("Tue");
    expect(weekdayFor("2026-09-06")).toBe("Sun");
  });
});

describe("dateKeyIn", () => {
  it("gives today's date in the CALENDAR's zone, not the server's", () => {
    // 03:30 UTC on the 31st is still the 30th in Philadelphia.
    const now = new Date("2026-08-31T03:30:00Z");
    expect(dateKeyIn(now, "America/New_York")).toBe("2026-08-30");
    expect(dateKeyIn(now, "UTC")).toBe("2026-08-31");
  });

  it("falls back to the UTC date rather than throwing on an unknown zone", () => {
    const now = new Date("2026-08-31T03:30:00Z");
    expect(() => dateKeyIn(now, "Not/AZone")).not.toThrow();
    expect(dateKeyIn(now, "Not/AZone")).toBe("2026-08-31");
  });
});

describe("mapEvents", () => {
  const now = new Date("2026-08-31T13:00:00Z"); // 09:00 in New York, a Monday
  const tz = "America/New_York";

  const items = [
    { summary: "Standup", start: { dateTime: "2026-08-31T10:00:00-04:00" } },
    { summary: "Dentist", start: { dateTime: "2026-08-31T14:30:00-04:00" } },
    { summary: "Deploy window", start: { dateTime: "2026-09-02T09:00:00-04:00" } },
    { summary: "Conference", start: { date: "2026-09-03" } }
  ];

  it("shows a bare time for today and prefixes the weekday for later days", () => {
    // A bare "09:00" in a list spanning a week is ambiguous.
    expect(mapEvents(items, now, tz, 10)).toEqual([
      { time: "10:00", title: "Standup" },
      { time: "14:30", title: "Dentist" },
      { time: "Wed 09:00", title: "Deploy window" },
      { time: "Thu", title: "Conference" }
    ]);
  });

  it("labels an all-day event today as 'All day'", () => {
    const mapped = mapEvents([{ summary: "Holiday", start: { date: "2026-08-31" } }], now, tz, 10);
    expect(mapped).toEqual([{ time: "All day", title: "Holiday" }]);
  });

  it("keeps the panel on the calendar's clock, not the server's", () => {
    // Same fixtures, a UTC-running box: the displayed times must not shift.
    expect(mapEvents(items, now, tz, 10)[0].time).toBe("10:00");
  });

  it("drops cancelled events", () => {
    const withCancelled = [
      { summary: "Cancelled thing", status: "cancelled", start: { dateTime: "2026-08-31T11:00:00-04:00" } },
      ...items
    ];
    expect(mapEvents(withCancelled, now, tz, 10).map((e) => e.title)).not.toContain("Cancelled thing");
  });

  it("drops events with no usable start rather than rendering a blank slot", () => {
    const messy = [{ summary: "No start" }, { summary: "Fine", start: { dateTime: "2026-08-31T10:00:00-04:00" } }];
    expect(mapEvents(messy, now, tz, 10)).toEqual([{ time: "10:00", title: "Fine" }]);
  });

  it("labels an untitled event rather than showing an empty row", () => {
    const untitled = [{ start: { dateTime: "2026-08-31T10:00:00-04:00" } }];
    expect(mapEvents(untitled, now, tz, 10)).toEqual([{ time: "10:00", title: "(no title)" }]);
  });

  it("collapses the whitespace a pasted event title arrives with", () => {
    const messy = [{ summary: "  Two   spaces\nand a break ", start: { date: "2026-09-03" } }];
    expect(mapEvents(messy, now, tz, 10)[0].title).toBe("Two spaces and a break");
  });

  it("caps to the panel's count", () => {
    expect(mapEvents(items, now, tz, 2)).toHaveLength(2);
  });

  it("returns an empty list, not a throw, for junk or an empty calendar", () => {
    for (const junk of [null, undefined, {}, "nope", []]) {
      expect(() => mapEvents(junk, now, tz, 5)).not.toThrow();
      expect(mapEvents(junk, now, tz, 5)).toEqual([]);
    }
  });

  it("preserves the API's ordering — it already asked for startTime order", () => {
    const mapped = mapEvents(items, now, tz, 10);
    expect(mapped.map((e) => e.title)).toEqual(["Standup", "Dentist", "Deploy window", "Conference"]);
  });
});

describe("window and count settings", () => {
  it("defaults to a panel-sized handful over the next week", () => {
    delete process.env.CALENDAR_LIMIT;
    delete process.env.CALENDAR_DAYS;
    expect(calendarLimit()).toBe(5);
    expect(calendarDays()).toBe(7);
  });

  it("takes overrides and ignores junk ones", () => {
    process.env.CALENDAR_LIMIT = "8";
    process.env.CALENDAR_DAYS = "14";
    expect(calendarLimit()).toBe(8);
    expect(calendarDays()).toBe(14);

    for (const junk of ["0", "-1", "abc", ""]) {
      process.env.CALENDAR_LIMIT = junk;
      process.env.CALENDAR_DAYS = junk;
      expect(calendarLimit(), junk).toBe(5);
      expect(calendarDays(), junk).toBe(7);
    }
  });
});
