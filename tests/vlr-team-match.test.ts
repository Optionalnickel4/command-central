import { describe, expect, it } from "vitest";
import { envelope, formatTeamMatch, splitVlrDate, type TeamMatchData } from "@/lib/vlr";

/**
 * The four states of /api/v1/assistant/team-match.
 *
 * The payloads below are REAL responses captured from the live API
 * (10.0.0.21:8000) while building this, not invented shapes — that is the
 * point of pinning them here: the endpoint answers HTTP 200 for all four
 * states, including "none", so the formatter must branch on `state` and never
 * on whether `match` happens to look populated.
 */

const LIVE = {
  data: {
    state: "live",
    team: { id: "6456", name: "FlyQuest RED", tag: null },
    match: {
      id: "724899", url: "https://www.vlr.gg/724899",
      event: "Game Changers 2026: North America Stage 2",
      series: "Playoffs: Upper Semifinals", status: "live", format: "BO3",
      opponent: "Axolotl",
      map_score: { team: null, opponent: null },
      current_map: null
    }
  },
  stale: false,
  error: null
};

const UPCOMING = {
  data: {
    state: "upcoming",
    team: { id: "21711", name: "SwimTrek Blue", tag: null },
    match: {
      id: "724900", url: "https://www.vlr.gg/724900", status: "upcoming",
      opponent: "Shopify Rebellion Gold", opponent_id: null,
      event: "GC 26: NA Stage 2", date: "2026/09/027:30 pm"
    }
  },
  stale: false,
  error: null
};

const COMPLETED = {
  data: {
    state: "completed",
    team: { id: "2", name: "Sentinels", tag: null },
    match: {
      id: "729757", url: "https://www.vlr.gg/729757", status: "completed",
      opponent: "KRÜ Esports", opponent_id: null, result: "loss", score: "0:2",
      event: "VCT 26: AMER Stage 2", date: "2026/08/227:10 pm"
    }
  },
  stale: false,
  error: null
};

const NONE = {
  data: { state: "none", team: null, match: null },
  stale: false,
  error: "team not found: nonexistentteamxyz"
};

const fmt = (asked: string, payload: unknown) =>
  formatTeamMatch(asked, envelope<TeamMatchData>(payload));

describe("formatTeamMatch — live", () => {
  it("leads with the fact the team is playing now", () => {
    const { text, found } = fmt("FlyQuest RED", LIVE);
    expect(found).toBe(true);
    expect(text).toContain("STATE=live");
    expect(text).toContain("FlyQuest RED vs Axolotl");
    expect(text).toContain("LIVE NOW");
  });

  it("never renders a missing round score as 0-0", () => {
    // The captured live match had current_map: null (VLR marks a match live
    // when its page opens, before the first map). Saying "0-0" there would be
    // fabrication, so the formatter must say the score isn't posted yet.
    const { text } = fmt("FlyQuest RED", LIVE);
    expect(text).toContain("no round score posted yet");
    expect(text).not.toMatch(/\b0[-–]0\b/);
  });

  it("orients the round score to the team that was asked about", () => {
    // current_map's exact key names could not be pinned against live data, so
    // readRounds accepts several spellings; this covers the orientation logic,
    // not an API contract.
    const leading = {
      ...LIVE,
      data: {
        ...LIVE.data,
        match: { ...LIVE.data.match, current_map: { name: "Ascent", team: 4, opponent: 2 } }
      }
    };
    expect(fmt("FlyQuest RED", leading).text).toContain("FlyQuest RED leads Axolotl 4–2");

    const trailing = {
      ...LIVE,
      data: {
        ...LIVE.data,
        match: { ...LIVE.data.match, current_map: { name: "Ascent", team: 2, opponent: 4 } }
      }
    };
    // Trailing is still written team-first: "2-4", not flipped to look like a lead.
    expect(fmt("FlyQuest RED", trailing).text).toContain("FlyQuest RED trails Axolotl 2–4");

    const tied = {
      ...LIVE,
      data: {
        ...LIVE.data,
        match: { ...LIVE.data.match, current_map: { map: "Bind", team_rounds: 3, opponent_rounds: 3 } }
      }
    };
    expect(fmt("FlyQuest RED", tied).text).toContain("FlyQuest RED is tied with Axolotl 3–3");
  });

  it("reports the map score when the series has one", () => {
    const withMaps = {
      ...LIVE,
      data: {
        ...LIVE.data,
        match: { ...LIVE.data.match, map_score: { team: 1, opponent: 0 } }
      }
    };
    expect(fmt("FlyQuest RED", withMaps).text).toContain("Maps won: FlyQuest RED leads Axolotl 1–0");
  });
});

describe("formatTeamMatch — upcoming, completed, none", () => {
  it("says the team is not live and gives the next fixture", () => {
    const { text, found } = fmt("SwimTrek Blue", UPCOMING);
    expect(found).toBe(true);
    expect(text).toContain("STATE=upcoming");
    expect(text).toContain("NOT live");
    expect(text).toContain("vs Shopify Rebellion Gold");
  });

  it("splits the glued date the API returns", () => {
    // "2026/09/027:30 pm" is a date and a time run together with no separator.
    expect(fmt("SwimTrek Blue", UPCOMING).text).toContain("2026/09/02 at 7:30 pm");
    expect(splitVlrDate("2026/08/227:10 pm")).toBe("2026/08/22 at 7:10 pm");
    expect(splitVlrDate("not a date")).toBe("not a date");
  });

  it("gives the last result, team-first, for a completed state", () => {
    const { text, found } = fmt("Sentinels", COMPLETED);
    expect(found).toBe(true);
    expect(text).toContain("STATE=completed");
    expect(text).toContain("LOSS 0:2 vs KRÜ Esports");
    expect(text).toContain("no scheduled next match");
  });

  it("admits it could not find the team rather than substituting one", () => {
    const { text, found } = fmt("nonexistentteamxyz", NONE);
    // found:false is what makes the chat route tell the model not to invent.
    expect(found).toBe(false);
    expect(text).toContain("STATE=none");
    expect(text).toContain("nonexistentteamxyz");
    expect(text).toContain("team not found");
  });

  it("surfaces a stale cache read instead of hiding it", () => {
    expect(fmt("Sentinels", { ...COMPLETED, stale: true }).text).toContain("stale");
  });

  it("treats an unrecognised state as not-found rather than guessing a branch", () => {
    const weird = { data: { state: "queued", team: { name: "X" }, match: { opponent: "Y" } } };
    expect(fmt("X", weird).found).toBe(false);
  });
});
