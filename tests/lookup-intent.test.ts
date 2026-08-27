import { afterEach, describe, expect, it } from "vitest";
import { looksLikeEsports, parseIntent, parsePrepass } from "@/lib/lookup-intent";

/**
 * The esports intent parse — the stage that decides whether a chat turn spends
 * a vlr-api round trip, and on what.
 *
 * Contracts, not live data: these assert the KIND and the extracted ENTITY, and
 * never that a particular team exists or is ranked anywhere.
 *
 * esportsEnabled() reads process.env on every call and is opt-OUT, so the
 * default (unset) is already "on" for these tests; the disabled block sets and
 * restores the flag explicitly.
 */

afterEach(() => {
  delete process.env.ENABLE_ESPORTS;
});

describe("parseIntent — league-wide questions", () => {
  it("classifies a bare rankings question as rankings with no region", () => {
    expect(parseIntent("what are the rankings right now?")).toMatchObject({
      kind: "rankings", query: "", via: "keyword"
    });
  });

  it("classifies standings as rankings — the feed has one endpoint for both", () => {
    expect(parseIntent("who is top of the standings?").kind).toBe("rankings");
  });

  it("extracts an explicit region code from a rankings question", () => {
    expect(parseIntent("show me the gc rankings")).toMatchObject({ kind: "rankings", query: "gc" });
    expect(parseIntent("rankings for na please")).toMatchObject({ kind: "rankings", query: "na" });
  });

  it("collapses emea/eu to the default region, which the feed serves unfiltered", () => {
    expect(parseIntent("what are the emea rankings")).toMatchObject({ kind: "rankings", query: "" });
    expect(parseIntent("eu rankings?")).toMatchObject({ kind: "rankings", query: "" });
  });

  it("routes leaderboard phrasings to stats", () => {
    // The parse wants "stats" ahead of the superlative, or one of the explicit
    // leaderboard words. Pinned as the contract it actually has.
    expect(parseIntent("show stats for the top players").kind).toBe("stats");
    expect(parseIntent("show the leaderboard").kind).toBe("stats");
    expect(parseIntent("who has the best r2.0?").kind).toBe("stats");
  });

  it("leaves phrasing it cannot classify to the pre-pass rather than guessing", () => {
    // The keyword stage is deliberately conservative: an esports question it
    // does not recognise must return "none" AND still smell like esports, so
    // the cheap JSON pre-pass gets its turn. Guessing here would spend a
    // lookup on the wrong thing.
    const msg = "who are the stats leaders this split?";
    expect(parseIntent(msg).kind).toBe("none");
    expect(looksLikeEsports(msg)).toBe(true);
  });

  it("separates live, upcoming, results and events", () => {
    expect(parseIntent("what is playing right now?").kind).toBe("live");
    expect(parseIntent("any live matches?").kind).toBe("live");
    expect(parseIntent("what is the upcoming schedule?").kind).toBe("upcoming");
    expect(parseIntent("who won yesterday?").kind).toBe("results");
    expect(parseIntent("what tournaments are on?").kind).toBe("events");
  });
});

describe("parseIntent — entity extraction", () => {
  it("extracts a team name from an explicit team question", () => {
    expect(parseIntent("tell me about team Sentinels")).toMatchObject({
      kind: "team", query: "Sentinels"
    });
  });

  it("extracts a player name from an explicit player question", () => {
    expect(parseIntent("player TenZ")).toMatchObject({ kind: "player", query: "TenZ" });
  });

  it("extracts a player name from the possessive-stats phrasing", () => {
    expect(parseIntent("what are TenZ's numbers?")).toMatchObject({
      kind: "player", query: "TenZ"
    });
  });

  it("extracts a numeric match id", () => {
    expect(parseIntent("show me match 407490")).toMatchObject({
      kind: "match", query: "407490"
    });
  });
});

describe("parseIntent — greedy-capture regression (the Karmine Corp bug)", () => {
  /**
   * The capture is deliberately greedy, so without the stopword cleaner the
   * whole trailing clause became the query and the lookup missed silently.
   * These pin the cleaner: the query must be the NAME only.
   */
  it("stops the team capture at the first filler word", () => {
    expect(parseIntent("how did team Karmine Corp do in their last matches?")).toMatchObject({
      kind: "team", query: "Karmine Corp"
    });
  });

  it("stops at filler for other trailing clauses too", () => {
    expect(parseIntent("is team Fnatic playing today?").query).toBe("Fnatic");
    expect(parseIntent("what does team Paper Rex look like now").query).toBe("Paper Rex");
    expect(parseIntent("team G2 vs NRG").query).toBe("G2");
  });

  it("never returns a query longer than a plausible name", () => {
    const q = parseIntent("team Alpha Beta Gamma Delta Epsilon Zeta").query;
    expect(q.split(" ").length).toBeLessThanOrEqual(4);
  });

  it("keeps a name that happens to be one word before punctuation", () => {
    expect(parseIntent("team Loud.").query).toBe("Loud");
  });
});

describe("parseIntent — non-esports text", () => {
  it("returns no lookup for questions with nothing esports-shaped in them", () => {
    for (const msg of [
      "what's the weather in Philadelphia?",
      "how much RAM is container 220 using?",
      "restart the nginx service",
      "summarise today's news",
      ""
    ]) {
      expect(parseIntent(msg)).toMatchObject({ kind: "none", query: "", via: "none" });
    }
  });
});

describe("looksLikeEsports — the pre-pass gate", () => {
  it("is true for esports-shaped questions the keyword parse may not classify", () => {
    expect(looksLikeEsports("how are things looking in valorant this split?")).toBe(true);
    expect(looksLikeEsports("anything interesting at vct?")).toBe(true);
  });

  it("is false for text with no esports vocabulary, so no pre-pass is paid for", () => {
    expect(looksLikeEsports("restart the nginx container")).toBe(false);
    expect(looksLikeEsports("what's the weather?")).toBe(false);
  });
});

describe("ENABLE_ESPORTS=false", () => {
  it("short-circuits both stages so no turn can reach vlr-api", () => {
    process.env.ENABLE_ESPORTS = "false";
    expect(parseIntent("show me the gc rankings")).toMatchObject({ kind: "none", via: "none" });
    expect(parseIntent("team Sentinels").kind).toBe("none");
    expect(looksLikeEsports("valorant rankings")).toBe(false);
  });
});

describe("parsePrepass — strict parse of the model's JSON", () => {
  it("accepts a clean intent line", () => {
    expect(parsePrepass('{"lookup":"team","query":"Sentinels"}')).toMatchObject({
      kind: "team", query: "Sentinels", via: "prepass"
    });
  });

  it("tolerates prose wrapped around the JSON", () => {
    expect(parsePrepass('Sure! {"lookup":"rankings","query":"na"} — hope that helps')).toMatchObject({
      kind: "rankings", query: "na"
    });
  });

  it("applies the same stopword cleaning to the model's query", () => {
    expect(parsePrepass('{"lookup":"team","query":"Karmine Corp last matches"}').query)
      .toBe("Karmine Corp");
  });

  it("falls back to no lookup on anything unexpected rather than guessing", () => {
    for (const raw of [
      "",
      "no json here",
      "{ not valid json",
      '{"lookup":"none","query":""}',
      '{"lookup":"weather","query":"philly"}',
      '{"query":"Sentinels"}'
    ]) {
      expect(parsePrepass(raw)).toMatchObject({ kind: "none", query: "", via: "none" });
    }
  });
});
