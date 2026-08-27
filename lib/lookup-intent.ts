import { runVlrLookup, type LookupKind, type LookupResult } from "@/lib/vlr";
import { esportsEnabled } from "@/lib/features";

/**
 * Decides whether a turn needs a live vlr-api lookup, and of what.
 *
 * Two stages, cheapest first:
 *   1. A keyword/entity parse that catches the common phrasings for free.
 *   2. Only if that is inconclusive AND the message smells like esports, a
 *      cheap JSON pre-pass through the active backend for arbitrary phrasing.
 *
 * Strictly ONE lookup per turn. Any parse failure falls back to "none" so a
 * confused pre-pass can never wedge or inflate a turn.
 *
 * All three entry points short-circuit when ENABLE_ESPORTS is off, so a turn on
 * an instance without vlr-api never pays for the pre-pass and never fires a
 * doomed round-trip. The chat route needs no change: it already skips the
 * pre-pass on "none" and attaches nothing when the lookup returns null.
 */

const ESPORTS_HINT =
  /\b(valorant|vlr|esports?|match(es)?|tournament|roster|lineup|standings?|rankings?|leaderboard|scrim|playoffs?|vct|game ?changers?|team|player|stats?)\b/i;

/**
 * Trailing filler that a greedy capture swallows. Without this,
 * "team Karmine Corp do in their last matches" captured the whole tail and the
 * lookup missed — the model then silently fell back to the snapshot.
 */
const STOPWORDS = new Set([
  "do", "does", "did", "is", "are", "was", "were", "has", "have", "had",
  "in", "on", "at", "to", "for", "of", "their", "his", "her", "its", "the",
  "last", "recent", "next", "latest", "play", "played", "playing", "plays",
  "vs", "versus", "against", "match", "matches", "result", "results", "game",
  "games", "roster", "lineup", "stats", "statistics", "record", "form",
  "look", "like", "doing", "today", "now", "please", "me", "us", "and", "with"
]);

/** Keep the leading proper-noun-ish run, dropping trailing filler. */
function cleanEntity(raw: string): string {
  const words = raw.trim().replace(/[?.!,]+$/, "").split(/\s+/);
  const kept: string[] = [];
  for (const w of words) {
    if (STOPWORDS.has(w.toLowerCase())) break;
    kept.push(w);
    if (kept.length >= 4) break; // team/player names are short
  }
  return (kept.length ? kept : words.slice(0, 1)).join(" ").trim();
}

const KINDS: LookupKind[] = [
  "player", "team", "match", "rankings", "stats", "results", "upcoming", "live", "events", "none"
];

export interface Intent {
  kind: LookupKind;
  query: string;
  /** How the intent was decided — surfaced in logs, not to the user. */
  via: "keyword" | "prepass" | "none";
}

/** Stage 1 — obvious phrasings, no model call. */
export function parseIntent(message: string): Intent {
  if (!esportsEnabled()) return { kind: "none", query: "", via: "none" };
  const m = message.trim();
  const low = m.toLowerCase();

  // Explicit region rankings, e.g. "show me the gc rankings"
  const region = /\b(gc|na|eu|emea|ap|pacific|br|kr|cn|jp|americas|china)\b[^.]*\brank/i.exec(low)
    ?? /\brank(ing)?s?\b[^.]*\b(gc|na|eu|emea|ap|pacific|br|kr|cn|jp|americas|china)\b/i.exec(low);
  if (region) {
    const code = (region[1] && region[1].length <= 6 ? region[1] : region[2]) ?? "";
    return { kind: "rankings", query: code === "emea" || code === "eu" ? "" : code, via: "keyword" };
  }
  if (/\brank(ing)?s?\b|\bstandings?\b/i.test(low)) return { kind: "rankings", query: "", via: "keyword" };

  if (/\b(stat|statistic)s?\b.*\b(leader|top|best)\b|\bleaderboard\b|\br2\.?0\b/i.test(low))
    return { kind: "stats", query: "", via: "keyword" };

  if (/\blive\b.*\bmatch|match.*\blive\b|playing (right )?now|on right now/i.test(low))
    return { kind: "live", query: "", via: "keyword" };
  if (/\bupcoming\b|\bnext match|\bschedule\b|who plays next/i.test(low))
    return { kind: "upcoming", query: "", via: "keyword" };
  if (/\bresults?\b|\bscores?\b|\bwho won\b|\blast match\b/i.test(low))
    return { kind: "results", query: "", via: "keyword" };
  if (/\bevents?\b|\btournaments?\b/i.test(low)) return { kind: "events", query: "", via: "keyword" };

  // "player <name>" / "<name>'s stats"
  const player = /\bplayer\s+([A-Za-z0-9_.\- ]{2,24})/i.exec(m)
    ?? /\b([A-Za-z0-9_.\-]{2,20})(?:'s|s')\s+(?:stats|numbers|performance|rating)/i.exec(m);
  if (player) return { kind: "player", query: cleanEntity(player[1]), via: "keyword" };

  const team = /\bteam\s+([A-Za-z0-9_.\- ]{2,28})/i.exec(m);
  if (team) return { kind: "team", query: cleanEntity(team[1]), via: "keyword" };

  const matchId = /\bmatch\s+(?:id\s*)?(\d{5,})/i.exec(m);
  if (matchId) return { kind: "match", query: matchId[1], via: "keyword" };

  return { kind: "none", query: "", via: "none" };
}

/** Does this look like an esports question at all? Gates the pre-pass. */
export function looksLikeEsports(message: string): boolean {
  return esportsEnabled() && ESPORTS_HINT.test(message);
}

/**
 * Stage 2 — ask the backend for a tiny JSON intent. Strict-parsed; anything
 * unexpected becomes "none" rather than a guess.
 */
export function parsePrepass(raw: string): Intent {
  try {
    const match = /\{[\s\S]*\}/.exec(raw); // tolerate stray prose around the JSON
    if (!match) return { kind: "none", query: "", via: "none" };
    const obj = JSON.parse(match[0]);
    const kind = String(obj?.lookup ?? "none").toLowerCase() as LookupKind;
    if (!KINDS.includes(kind) || kind === "none") return { kind: "none", query: "", via: "none" };
    return { kind, query: cleanEntity(String(obj?.query ?? "")).slice(0, 60), via: "prepass" };
  } catch {
    return { kind: "none", query: "", via: "none" };
  }
}

export const PREPASS_PROMPT = (message: string) =>
  [
    "You are an intent classifier. Reply with ONE line of JSON and nothing else.",
    'Schema: {"lookup":"player|team|match|rankings|stats|results|upcoming|live|events|none","query":"<name/id/region or empty>"}',
    'If the question does not need a specific Valorant esports lookup, reply {"lookup":"none","query":""}.',
    "",
    `Question: ${message}`
  ].join("\n");

/** Execute the chosen lookup, or nothing. */
export async function performLookup(intent: Intent): Promise<LookupResult | null> {
  if (!esportsEnabled() || intent.kind === "none") return null;
  return runVlrLookup(intent.kind, intent.query);
}
