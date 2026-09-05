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

describe("parseIntent — team-name questions (the /assistant/team-match intents)", () => {
  /**
   * These are the phrasings that used to fall through to a generic
   * live/results lookup (or to nothing) and lost the team entirely. They must
   * resolve to team-match WITH the name, because the endpoint is the only one
   * that can answer "is X winning" with a round score.
   */
  it("routes the score / who's-winning phrasings to team-match", () => {
    expect(parseIntent("what's the score of the Sentinels game?")).toMatchObject({
      kind: "team-match", query: "Sentinels"
    });
    expect(parseIntent("who's winning the NRG match?")).toMatchObject({
      kind: "team-match", query: "NRG"
    });
    expect(parseIntent("is Sentinels winning?")).toMatchObject({
      kind: "team-match", query: "Sentinels"
    });
  });

  it("routes the is-it-playing / next-match phrasings to team-match", () => {
    expect(parseIntent("is Sentinels playing today?")).toMatchObject({
      kind: "team-match", query: "Sentinels"
    });
    expect(parseIntent("when's Sentinels' next match?")).toMatchObject({
      kind: "team-match", query: "Sentinels"
    });
    expect(parseIntent("what's up with Sentinels?")).toMatchObject({
      kind: "team-match", query: "Sentinels"
    });
  });

  it("routes the how-did-they-do phrasings to team-match", () => {
    expect(parseIntent("how did Sentinels do?")).toMatchObject({
      kind: "team-match", query: "Sentinels"
    });
    expect(parseIntent("what was Sentinels' last match?")).toMatchObject({
      kind: "team-match", query: "Sentinels"
    });
  });

  it("keeps a leading 'the' when it is part of the name", () => {
    // "The Spiders" is a real team; the generic entity cleaner drops a leading
    // "the" as filler, which would have searched for the wrong name.
    expect(parseIntent("what was The Spiders' last match?").query).toBe("The Spiders");
  });

  it("routes standings questions about one team to team-rank", () => {
    expect(parseIntent("where does Sentinels rank?")).toMatchObject({
      kind: "team-rank", query: "Sentinels"
    });
    expect(parseIntent("what rank is NRG")).toMatchObject({
      kind: "team-rank", query: "NRG"
    });
    expect(parseIntent("what is Sentinels' standing?")).toMatchObject({
      kind: "team-rank", query: "Sentinels"
    });
  });

  it("leaves the explicit 'team <name>' phrasing on the fuller team profile", () => {
    // Regression guard for the pinned contract above: "team X" keeps returning
    // the roster+results+upcoming profile, which is a superset of team-match.
    expect(parseIntent("how did team Karmine Corp do in their last matches?").kind).toBe("team");
    expect(parseIntent("tell me about team Sentinels").kind).toBe("team");
  });

  it("does not spend a team lookup on a non-team question", () => {
    // The loose phrasings need an esports signal or a capitalised name, so
    // household questions stay out of vlr-api.
    expect(parseIntent("what's up with the printer?").kind).toBe("none");
    expect(parseIntent("how's the deploy going?").kind).toBe("none");
  });
});

describe("parseIntent — league-wide phrasings added with the assistant endpoints", () => {
  it("treats a bare who's-winning as a question about the live slate", () => {
    expect(parseIntent("who's winning?").kind).toBe("live");
    expect(parseIntent("any games on?").kind).toBe("live");
    expect(parseIntent("what's live right now?").kind).toBe("live");
  });

  it("treats what's-on-this-week as an events question", () => {
    expect(parseIntent("what's on this week?").kind).toBe("events");
    expect(parseIntent("what tournaments are running?").kind).toBe("events");
  });

  it("carries region and timespan on a top-fragger question", () => {
    // /stats 400s on anything but na|eu and 30d|60d|90d|all, so the parse
    // hands the pair through and runVlrLookup validates it.
    expect(parseIntent("who's the top fragger in na?")).toMatchObject({ kind: "stats" });
    expect(parseIntent("who's the top fragger in na?").query).toMatch(/^na:/);
    expect(parseIntent("best player in eu over the last 90 days").query).toBe("eu:90d");
    expect(parseIntent("who's the best player right now?").kind).toBe("stats");
  });
});
