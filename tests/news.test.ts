import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_FEEDS, linkKey, mergeHeadlines, newsFeeds, newsLimit, normalizeFeed,
  readTextLimited, sourceNameFor, titleKey, type Headline
} from "@/lib/news";
import { OK, UPSTREAM_UNAVAILABLE, aggregateStatus } from "@/lib/response-status";

/**
 * The pure half of the news source: what happens to items AFTER the feeds are
 * fetched. The fetching itself is deliberately not exercised — it is transport,
 * and testing it would mean reaching five publishers on every `npm test`.
 *
 * Fixtures follow the shape rss-parser actually produces for these feeds (Atom
 * from The Verge, RSS 2.0 from the rest), trimmed to the fields read here.
 */

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
});

const h = (over: Partial<Headline> = {}): Headline => ({
  title: "A headline",
  url: "https://example.com/a",
  source: "Example",
  publishedAt: "2026-08-30T12:00:00.000Z",
  ...over
});

describe("readTextLimited — bounded transport", () => {
  it("reads a multi-chunk UTF-8 body below the byte cap", async () => {
    const bytes = new TextEncoder().encode("hello 🐁");
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 7));
        controller.enqueue(bytes.slice(7));
        controller.close();
      }
    });
    expect(await readTextLimited(new Response(body), bytes.length)).toBe("hello 🐁");
  });

  it("rejects from Content-Length before reading an oversized response", async () => {
    const res = new Response("small", { headers: { "content-length": "999" } });
    await expect(readTextLimited(res, 10)).rejects.toThrow("byte limit");
  });

  it("cancels a streamed response as soon as actual bytes exceed the cap", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(6));
      },
      cancel() {
        cancelled = true;
      }
    });
    await expect(readTextLimited(new Response(body), 5)).rejects.toThrow("byte limit");
    expect(cancelled).toBe(true);
  });
});

describe("mergeHeadlines — sorting", () => {
  it("puts the newest story first regardless of which feed it came from", () => {
    const merged = mergeHeadlines(
      [
        h({ title: "Older", url: "https://a.com/1", publishedAt: "2026-08-28T00:00:00.000Z" }),
        h({ title: "Newest", url: "https://b.com/2", publishedAt: "2026-08-30T09:00:00.000Z" }),
        h({ title: "Middle", url: "https://c.com/3", publishedAt: "2026-08-29T00:00:00.000Z" })
      ],
      10
    );
    expect(merged.map((m) => m.title)).toEqual(["Newest", "Middle", "Older"]);
  });

  it("keeps undated items rather than dropping them, but sorts them last", () => {
    const merged = mergeHeadlines(
      [
        h({ title: "No date", url: "https://a.com/1", publishedAt: null }),
        h({ title: "Dated", url: "https://b.com/2", publishedAt: "2026-08-29T00:00:00.000Z" })
      ],
      10
    );
    expect(merged.map((m) => m.title)).toEqual(["Dated", "No date"]);
  });

  it("treats an unparseable date as undated instead of throwing", () => {
    const merged = mergeHeadlines(
      [
        h({ title: "Junk date", url: "https://a.com/1", publishedAt: "not a date" }),
        h({ title: "Dated", url: "https://b.com/2", publishedAt: "2026-08-29T00:00:00.000Z" })
      ],
      10
    );
    expect(merged.map((m) => m.title)).toEqual(["Dated", "Junk date"]);
  });
});

describe("mergeHeadlines — dedupe", () => {
  it("collapses the same article syndicated by two feeds", () => {
    const merged = mergeHeadlines(
      [
        h({ title: "GPU driver fixes stutter", url: "https://ars.com/gpu", source: "Ars Technica" }),
        h({ title: "GPU driver fixes stutter", url: "https://hn.com/gpu", source: "Hacker News" })
      ],
      10
    );
    expect(merged).toHaveLength(1);
  });

  it("ignores utm tails and trailing slashes when comparing links", () => {
    // The same article arrives with different tracking tails per feed.
    const merged = mergeHeadlines(
      [
        h({ title: "One way of putting it", url: "https://site.com/post/" }),
        h({ title: "Another way entirely", url: "https://www.site.com/post?utm_source=rss#top" })
      ],
      10
    );
    expect(merged).toHaveLength(1);
  });

  it("ignores case and punctuation when comparing titles", () => {
    const merged = mergeHeadlines(
      [
        h({ title: "Valve's Steam Deck 2 — the details", url: "https://a.com/1" }),
        h({ title: "valves steam deck 2 the details", url: "https://b.com/2" })
      ],
      10
    );
    expect(merged).toHaveLength(1);
  });

  it("matches a smart apostrophe against a straight one — feeds differ on this", () => {
    // Several of these publishers emit curly quotes while HN's copy of the same
    // story is straight. One story, one slot.
    const merged = mergeHeadlines(
      [
        h({ title: "Valve’s next handheld", url: "https://a.com/1" }),
        h({ title: "Valve's next handheld", url: "https://b.com/2" })
      ],
      10
    );
    expect(merged).toHaveLength(1);
  });

  it("keeps the dated copy when a story appears with and without a date", () => {
    const merged = mergeHeadlines(
      [
        h({ title: "Same story", url: "https://a.com/1", source: "Undated feed", publishedAt: null }),
        h({ title: "Same story", url: "https://b.com/2", source: "Dated feed", publishedAt: "2026-08-30T00:00:00.000Z" })
      ],
      10
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe("Dated feed");
  });

  it("does not collapse genuinely different stories", () => {
    const merged = mergeHeadlines(
      [
        h({ title: "First story", url: "https://a.com/1" }),
        h({ title: "Second story", url: "https://a.com/2" }),
        h({ title: "Third story", url: "https://a.com/3" })
      ],
      10
    );
    expect(merged).toHaveLength(3);
  });
});

describe("mergeHeadlines — capping and hygiene", () => {
  it("caps to the panel's count", () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      h({ title: `Story ${i}`, url: `https://a.com/${i}` })
    );
    expect(mergeHeadlines(many, 6)).toHaveLength(6);
  });

  it("caps AFTER deduping, so duplicates don't eat visible slots", () => {
    const items = [
      ...Array.from({ length: 5 }, () => h({ title: "Dupe", url: "https://a.com/dupe" })),
      h({ title: "Real one", url: "https://b.com/real" })
    ];
    const merged = mergeHeadlines(items, 2);
    expect(merged.map((m) => m.title).sort()).toEqual(["Dupe", "Real one"]);
  });

  it("drops items with no title or no link — they render as nothing useful", () => {
    const merged = mergeHeadlines(
      [h({ title: "", url: "https://a.com/1" }), h({ title: "  ", url: "https://a.com/2" }),
       h({ title: "Fine", url: "" }), h({ title: "Good", url: "https://a.com/4" })],
      10
    );
    expect(merged.map((m) => m.title)).toEqual(["Good"]);
  });

  it("returns an empty list, not a throw, when every feed gave nothing", () => {
    expect(mergeHeadlines([], 6)).toEqual([]);
  });
});

describe("normalizeFeed", () => {
  it("reads RSS 2.0 items and stamps them with the source name", () => {
    const parsed = {
      items: [
        { title: "Ars story", link: "https://arstechnica.com/x", isoDate: "2026-08-30T10:00:00.000Z" }
      ]
    };
    expect(normalizeFeed("Ars Technica", parsed)).toEqual([
      {
        title: "Ars story",
        url: "https://arstechnica.com/x",
        source: "Ars Technica",
        publishedAt: "2026-08-30T10:00:00.000Z"
      }
    ]);
  });

  it("falls back to pubDate when isoDate is absent, normalising to ISO", () => {
    const parsed = { items: [{ title: "T", link: "https://a.com/1", pubDate: "Sat, 30 Aug 2026 10:00:00 GMT" }] };
    expect(normalizeFeed("F", parsed)[0].publishedAt).toBe("2026-08-30T10:00:00.000Z");
  });

  it("keeps the item with a null date rather than dropping it", () => {
    const parsed = { items: [{ title: "T", link: "https://a.com/1" }] };
    expect(normalizeFeed("F", parsed)[0].publishedAt).toBeNull();
  });

  it("collapses the whitespace RSS titles arrive wrapped in", () => {
    const parsed = { items: [{ title: "\n  Spread   over\tlines \n", link: "https://a.com/1" }] };
    expect(normalizeFeed("F", parsed)[0].title).toBe("Spread over lines");
  });

  it("survives a feed that parsed to junk instead of throwing", () => {
    for (const junk of [null, undefined, {}, { items: null }, { items: "nope" }, []]) {
      expect(() => normalizeFeed("F", junk)).not.toThrow();
      expect(normalizeFeed("F", junk)).toEqual([]);
    }
  });

  it("skips individual malformed items without losing the good ones", () => {
    const parsed = { items: [{ title: "Good", link: "https://a.com/1" }, {}, { link: "https://a.com/2" }] };
    expect(normalizeFeed("F", parsed).map((i) => i.title)).toEqual(["Good"]);
  });
});

describe("feed configuration", () => {
  it("uses the five verified defaults when NEWS_FEEDS is unset", () => {
    delete process.env.NEWS_FEEDS;
    expect(newsFeeds()).toEqual(DEFAULT_FEEDS);
    expect(DEFAULT_FEEDS).toHaveLength(5);
    for (const f of DEFAULT_FEEDS) expect(f.url).toMatch(/^https:\/\//);
  });

  it("replaces the set wholesale from NEWS_FEEDS, naming sources by host", () => {
    process.env.NEWS_FEEDS = "https://example.com/rss, https://www.other.org/feed.xml";
    expect(newsFeeds()).toEqual([
      { name: "example.com", url: "https://example.com/rss" },
      { name: "other.org", url: "https://www.other.org/feed.xml" }
    ]);
  });

  it("falls back to the defaults when the override parses to nothing usable", () => {
    // A typo shouldn't silently blank the panel.
    for (const junk of ["", "   ", "tech,gaming", ",,,"]) {
      process.env.NEWS_FEEDS = junk;
      expect(newsFeeds(), junk).toEqual(DEFAULT_FEEDS);
    }
  });

  it("defaults the headline count to a panel-sized handful", () => {
    delete process.env.NEWS_LIMIT;
    expect(newsLimit()).toBe(6);
    process.env.NEWS_LIMIT = "10";
    expect(newsLimit()).toBe(10);
    for (const junk of ["0", "-3", "abc", ""]) {
      process.env.NEWS_LIMIT = junk;
      expect(newsLimit(), junk).toBe(6);
    }
  });
});

describe("key helpers", () => {
  it("linkKey ignores host www, query, fragment and trailing slash", () => {
    const canonical = linkKey("https://site.com/a/b");
    expect(linkKey("https://www.site.com/a/b/")).toBe(canonical);
    expect(linkKey("https://site.com/a/b?utm_source=rss")).toBe(canonical);
    expect(linkKey("https://site.com/a/b#top")).toBe(canonical);
  });

  it("linkKey keeps different paths on the same host apart", () => {
    expect(linkKey("https://site.com/a")).not.toBe(linkKey("https://site.com/b"));
  });

  it("linkKey degrades to the raw string for an unparseable URL", () => {
    expect(() => linkKey("::::")).not.toThrow();
    expect(linkKey("  NotAUrl ")).toBe("notaurl");
  });

  it("titleKey strips case and punctuation but keeps distinct titles distinct", () => {
    expect(titleKey("Hello, World!")).toBe(titleKey("hello world"));
    expect(titleKey("Hello World")).not.toBe(titleKey("Goodbye World"));
  });

  it("sourceNameFor derives a readable name and tolerates junk", () => {
    expect(sourceNameFor("https://www.pcgamer.com/rss/")).toBe("pcgamer.com");
    expect(sourceNameFor("not a url")).toBe("not a url");
  });
});

describe("the route's degradation contract", () => {
  /**
   * The regression that matters here: one publisher 403ing or moving its feed
   * must cost that feed's items and nothing else. Only a total blackout is 503.
   */
  const feeds = (down: number, total = 5) =>
    Array.from({ length: total }, (_, i) => ({ ok: i >= down }));

  it("stays 200 with one feed down — that is degradation, not failure", () => {
    expect(aggregateStatus(feeds(1))).toBe(OK);
  });

  it("stays 200 all the way down to a single surviving feed", () => {
    for (let down = 1; down <= 4; down++) expect(aggregateStatus(feeds(down))).toBe(OK);
  });

  it("is 503 only when every feed is down — nothing left to render", () => {
    expect(aggregateStatus(feeds(5))).toBe(UPSTREAM_UNAVAILABLE);
  });

  it("still merges the survivors' items when a feed drops out", () => {
    // What the panel actually shows in the degraded case: the rest of the news.
    const survived = [h({ title: "From a live feed", url: "https://live.com/1" })];
    expect(mergeHeadlines(survived, 6).map((m) => m.title)).toEqual(["From a live feed"]);
  });
});
