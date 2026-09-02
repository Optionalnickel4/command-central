/**
 * Server-side news source: a handful of public RSS/Atom feeds, merged.
 *
 * RSS needs no API key and has no rate tier to blow, which is why it beats a
 * news API here — but it does mean being a polite client (see the route's
 * cache) and tolerating feeds that break, move or 404 without warning.
 *
 * Feeds are fetched with our own fetch rather than rss-parser's parseURL so the
 * timeout, the User-Agent and the response-size cap stay under our control, and
 * so nothing in the bundle reaches for Node's http module. rss-parser then only
 * parses a string — which is the part worth a dependency, since RSS 2.0, Atom
 * and RDF all arrive at this route and their date and link fields differ.
 *
 * The shaping half (merge, dedupe, sort, cap) is pure and separated from the
 * transport so it can be unit-tested without reaching the open internet.
 */

import Parser from "rss-parser";

export interface FeedSource {
  /** Display name shown beside the headline. */
  name: string;
  url: string;
}

/**
 * The default feed set — tech and gaming. Every one of these was verified to
 * answer 200 with a valid RSS/Atom root from 220; The Verge is Atom, the rest
 * are RSS 2.0, which is exactly why the parsing is a library's job.
 *
 * Editable two ways: change this array, or set NEWS_FEEDS to a comma-separated
 * list of feed URLs to replace it wholesale without touching the code.
 */
export const DEFAULT_FEEDS: FeedSource[] = [
  { name: "The Verge", url: "https://www.theverge.com/rss/index.xml" },
  { name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index" },
  { name: "Hacker News", url: "https://hnrss.org/frontpage" },
  { name: "PC Gamer", url: "https://www.pcgamer.com/rss/" },
  { name: "Polygon", url: "https://www.polygon.com/rss/index.xml" }
];

/**
 * A URL-only override carries no display name, so derive one from the host:
 * "www.theverge.com" -> "theverge.com". Better than showing the whole URL in a
 * panel this narrow, and honest about where the item came from.
 */
export function sourceNameFor(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** The configured feed set: NEWS_FEEDS if set and non-empty, else the defaults. */
export function newsFeeds(): FeedSource[] {
  const raw = process.env.NEWS_FEEDS?.trim();
  if (!raw) return DEFAULT_FEEDS;
  const urls = raw
    .split(",")
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\//i.test(u));
  // An override that parses to nothing usable is a typo, not an instruction to
  // show an empty panel — fall back rather than silently going dark.
  return urls.length > 0 ? urls.map((url) => ({ name: sourceNameFor(url), url })) : DEFAULT_FEEDS;
}

/** How many headlines the panel shows. Small — it's an orbital card, not a page. */
export function newsLimit(): number {
  const n = Number(process.env.NEWS_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 6;
}

export interface Headline {
  title: string;
  url: string;
  source: string;
  /** ISO timestamp, or null when the feed gave no usable date. */
  publishedAt: string | null;
}

/**
 * A comparable identity for one story. Two feeds syndicating the same piece
 * (and HN linking what Ars published) should occupy one slot, not two.
 *
 * Links are compared without query or fragment, because the same article
 * arrives carrying different utm_* tails from different feeds.
 */
export function linkKey(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

/**
 * Titles vary by punctuation and case across feeds; compare on the letters.
 *
 * Apostrophes are DELETED rather than collapsed to a space, so "Valve\u2019s" (a
 * smart quote, which several of these publishers use), "Valve\'s" and "Valves"
 * all reduce alike. Collapsing them to a space would leave "valve s" and let
 * the same story through twice.
 */
export function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/['\u2018\u2019\u02bc]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function time(iso: string | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Merge every feed's items into the list the panel shows: newest first,
 * deduped by link and by title, capped.
 *
 * Undated items sort last rather than being dropped — some feeds omit dates,
 * and a headline with no timestamp is still a headline. Dedupe keeps the FIRST
 * occurrence in sorted order, so the copy with a real date wins over a copy
 * without one.
 */
export function mergeHeadlines(items: Headline[], limit: number): Headline[] {
  const usable = items.filter((i) => i.title.trim() && i.url.trim());

  const sorted = [...usable].sort((a, b) => time(b.publishedAt) - time(a.publishedAt));

  const seen = new Set<string>();
  const out: Headline[] = [];
  for (const item of sorted) {
    const byLink = `l:${linkKey(item.url)}`;
    const byTitle = `t:${titleKey(item.title)}`;
    if (seen.has(byLink) || seen.has(byTitle)) continue;
    seen.add(byLink);
    seen.add(byTitle);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

/** Collapse the whitespace RSS titles are full of (newlines, tabs, nbsp). */
function clean(text: unknown): string {
  return typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
}

/**
 * Shape one parsed feed's items. Pure: takes what rss-parser produced, not a
 * URL. rss-parser normalises Atom's <updated> and RSS's <pubDate> into isoDate,
 * and <link href> vs <link> into link, which is the whole reason it's here.
 */
export function normalizeFeed(source: string, parsed: unknown): Headline[] {
  const items = (parsed as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
  return items
    .map((raw) => {
      const item = raw as { title?: unknown; link?: unknown; isoDate?: unknown; pubDate?: unknown };
      const iso = clean(item.isoDate) || clean(item.pubDate);
      const parsedDate = iso ? Date.parse(iso) : NaN;
      return {
        title: clean(item.title),
        url: clean(item.link),
        source,
        publishedAt: Number.isFinite(parsedDate) ? new Date(parsedDate).toISOString() : null
      };
    })
    .filter((h) => h.title && h.url);
}

/** Some feeds are big (PC Gamer's is ~1.6 MB); don't buffer one without bound. */
export const MAX_FEED_BYTES = 4 * 1024 * 1024;

const parser = new Parser();

/** Read a response without ever buffering more than the configured byte cap. */
export async function readTextLimited(res: Response, maxBytes: number): Promise<string> {
  const rawLength = res.headers.get("content-length");
  if (rawLength !== null) {
    const declared = Number(rawLength);
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new Error("response body exceeds byte limit");
    }
  }

  if (!res.body) return "";

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("response body exceeds byte limit");
        throw new Error("response body exceeds byte limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Fetch and parse ONE feed. Throws on any failure — the route fans out with
 * allSettled so a single dead feed skips itself and the others still render.
 */
export async function fetchFeed(feed: FeedSource, timeoutMs = 8000): Promise<Headline[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(feed.url, {
      signal: controller.signal,
      cache: "no-store",
      // Several of these publishers 403 a bare fetch with no User-Agent.
      headers: {
        accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        "user-agent": "CommandCentral/1.0 (+personal dashboard; one poll per 15 min)"
      }
    });
    if (!res.ok) throw new Error(`${feed.name} -> ${res.status}`);

    const xml = await readTextLimited(res, MAX_FEED_BYTES);

    return normalizeFeed(feed.name, await parser.parseString(xml));
  } finally {
    clearTimeout(timer);
  }
}
