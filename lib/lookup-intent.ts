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

/**
 * Captures that are grammar, not a team. A one-word capture whose head is in
 * here is thrown away rather than spent on a lookup.
 */
const NOT_A_TEAM = new Set([
  "the", "a", "an", "any", "all", "there", "it", "they", "them", "we", "you", "i",
  "who", "what", "when", "where", "why", "how", "this", "that", "these", "those",
  "my", "our", "everyone", "anyone", "anything", "everything", "things", "stuff",
  "someone", "he", "she", "valorant", "esports", "esport", "vct", "game", "games",
  "match", "matches", "team", "teams", "today", "tonight", "tomorrow", "now"
]);

/**
 * Clean a captured team name.
 *
 * Close to cleanEntity, with two differences that matter for team names:
 * a leading "team " is dropped ("how did team X do" hands back "X"), and a
 * leading "the" is KEPT when more words follow, because "The Spiders" is a
 * real team while a bare "the" is grammar.
 */
export function cleanTeamName(raw: string): string {
  let words = String(raw ?? "").trim().replace(/[?.!,]+$/, "").split(/\s+/).filter(Boolean);
  if (words.length > 1 && words[0].toLowerCase() === "team") words = words.slice(1);
  const kept: string[] = [];
  for (const w of words) {
    const lw = w.toLowerCase().replace(/[?.!,]+$/, "");
    if (!kept.length && lw === "the" && words.length > 1) { kept.push(w); continue; }
    if (STOPWORDS.has(lw)) break;
    kept.push(w);
    if (kept.length >= 4) break;
  }
  const name = kept.join(" ").replace(/['\u2019]s?$/, "").replace(/[?.!,]+$/, "").trim();
  if (name.length < 2) return "";
  const head = name.toLowerCase().split(" ")[0];
  if (NOT_A_TEAM.has(name.toLowerCase())) return "";
  if (kept.length === 1 && NOT_A_TEAM.has(head)) return "";
  return name;
}

/**
 * Clean a capture whose NAME sits at the END of it.
 *
 * "what was Sentinels' last match" can only be matched by a pattern that
 * captures everything before "last match", so the name is the tail, not the
 * head — reading it from the left yields "what" and throws the question away.
 * Walk backwards instead, stopping at the first filler word.
 */
export function cleanTeamNameFromEnd(raw: string): string {
  const words = String(raw ?? "").trim().replace(/[?.!,]+$/, "").split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  for (let i = words.length - 1; i >= 0; i--) {
    const w = words[i].replace(/['\u2019]s?$/, "").replace(/[?.!,]+$/, "");
    const lw = w.toLowerCase();
    if (!w) break;
    if (lw === "the") {
      // Capitalised "The" is part of the name ("The Spiders"); a lowercase
      // "the" in front of a name is grammar and stops the walk.
      if (kept.length && /^[A-Z]/.test(words[i])) kept.unshift(w);
      break;
    }
    if (STOPWORDS.has(lw) || NOT_A_TEAM.has(lw)) break;
    kept.unshift(w);
    if (kept.length >= 4) break;
  }
  const name = kept.join(" ").trim();
  if (name.length < 2 || NOT_A_TEAM.has(name.toLowerCase())) return "";
  return name;
}

/**
 * Team-name question patterns for /assistant/team-match.
 *
 * `loose: true` marks a phrasing with no esports noun of its own ("what's up
 * with X") — those only fire when the message is otherwise esports-shaped or
 * the name is capitalised, so "what's up with the printer" is left to the
 * pre-pass instead of being spent on a doomed team lookup.
 */
const TEAM_MATCH_PATTERNS: { re: RegExp; loose?: boolean; fromEnd?: boolean }[] = [
  // "what's the score of the sentinels game"
  { re: /\b(?:score|result)\s+(?:of|for)\s+(?:the\s+)?(.{2,32}?)\s+(?:game|match|series)\b/i },
  // "who's winning the sentinels game"
  { re: /\bwho(?:'s|s| is)\s+winning\s+(?:the\s+)?(.{2,32}?)\s*(?:game|match|series)\b/i },
  // "is sentinels winning / ahead / live"
  { re: /\b(?:is|are)\s+(.{2,32}?)\s+(?:winning|losing|ahead|leading|live)\b/i },
  // "is sentinels playing today" — a time word (or the end) is required so
  // "is the music playing" doesn't reach the API.
  { re: /\b(?:is|are)\s+(.{2,32}?)\s+playing\s*(?:today|tonight|tomorrow|right now|now|this week|at all)?\s*[?.!]*$/i },
  { re: /\b(?:is|are)\s+(.{2,32}?)\s+playing\s+(?:today|tonight|tomorrow|right now|now|this week|at all)\b/i },
  // "when's sentinels' next match" / "when do sentinels play next"
  { re: /\bwhen(?:'s|s)?\s+(?:is\s+|are\s+|do(?:es)?\s+)?(.{2,32}?)(?:['\u2019]s?)?\s+(?:next\s+)?(?:match|game|play)/i },
  // "sentinels' last match" / "sentinels next game"
  { re: /\b(.{2,40}?)(?:['\u2019]s?)?\s+(?:last|latest|most recent|next|upcoming)\s+(?:match|game|result|fixture)\b/i, fromEnd: true },
  // "did sentinels win"
  { re: /\bdid\s+(.{2,32}?)\s+(?:win|lose|beat)\b/i },
  // "how did sentinels do" / "how are sentinels doing"
  { re: /\bhow\s+(?:did|does|do|are|is|was|were)\s+(.{2,32}?)\s+(?:do|doing|play|playing|look|looking|going|get on)\b/i, loose: true },
  // "what's up with sentinels"
  { re: /\bwhat'?s\s+up\s+with\s+(.{2,32}?)\s*[?.!]*$/i, loose: true }
];

/** Standings questions about one named team. */
const TEAM_RANK_PATTERNS: { re: RegExp; fromEnd?: boolean }[] = [
  { re: /\bwhere\s+(?:do|does|are|is)\s+(.{2,32}?)\s+(?:rank|sit|stand|place)/i },
  { re: /\bwhat\s+rank\s+(?:is|are)\s+(.{2,32}?)\s*[?.!]*$/i },
  // The apostrophe is required so "the standings" isn't read as a team name.
  { re: /\b(.{2,40}?)['\u2019]s?\s+(?:rank|ranking|standing|position)\b/i, fromEnd: true },
  { re: /\bhow\s+(?:high|well)\s+(?:do|does|are|is)\s+(.{2,32}?)\s+rank/i }
];

/** The region codes vlr-api's ?region= filter understands. */
const REGION_CODE = /^(gc|na|eu|emea|ap|pacific|br|kr|cn|jp|americas|china)$/i;

const KINDS: LookupKind[] = [
  "player", "team", "match", "rankings", "stats", "results", "upcoming", "live", "events",
  "team-match", "team-rank", "none"
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

  // Team-name questions run FIRST: "who's winning", "is X playing today" and
  // "where does X rank" are about a specific team, so the generic
  // live/results/rankings keywords further down must not swallow them.
  for (const { re, fromEnd } of TEAM_RANK_PATTERNS) {
    const hit = re.exec(m);
    const name = hit ? (fromEnd ? cleanTeamNameFromEnd(hit[1]) : cleanTeamName(hit[1])) : "";
    if (name) return { kind: "team-rank", query: name, via: "keyword" };
  }
  // The explicit "team <name>" phrasing is deliberately left alone: it keeps
  // routing to the fuller team profile (roster + recent results + upcoming),
  // which already answers "how did team X do" as a superset.
  if (!/\bteam\s+[A-Za-z0-9]/i.test(m)) {
    for (const { re, loose, fromEnd } of TEAM_MATCH_PATTERNS) {
      const hit = re.exec(m);
      const name = hit ? (fromEnd ? cleanTeamNameFromEnd(hit[1]) : cleanTeamName(hit[1])) : "";
      if (!name) continue;
      // A loose phrasing needs some other esports signal, or a capitalised
      // name, before it is worth a round trip.
      if (loose && !ESPORTS_HINT.test(m) && !/^[A-Z0-9]/.test(name)) continue;
      return { kind: "team-match", query: name, via: "keyword" };
    }
  }

  // Explicit region rankings, e.g. "show me the gc rankings"
  const region = /\b(gc|na|eu|emea|ap|pacific|br|kr|cn|jp|americas|china)\b[^.]*\brank/i.exec(low)
    ?? /\brank(ing)?s?\b[^.]*\b(gc|na|eu|emea|ap|pacific|br|kr|cn|jp|americas|china)\b/i.exec(low);
  if (region) {
    // Which capture holds the region depends on which pattern matched, and the
    // second one's group 1 is the optional "ing" of "rankings" — so pick the
    // group that IS a region rather than the first non-empty one. Guarding on
    // length alone let "rankings for na" resolve to the region "ing".
    const code = [region[1], region[2]].find((g) => g && REGION_CODE.test(g)) ?? "";
    return { kind: "rankings", query: code === "emea" || code === "eu" ? "" : code, via: "keyword" };
  }
  if (/\brank(ing)?s?\b|\bstandings?\b/i.test(low)) return { kind: "rankings", query: "", via: "keyword" };

  // Stats leaderboard, plus "top fragger in na" / "best player right now".
  // The query carries an optional "region:timespan" pair; runVlrLookup
  // validates both against what /stats actually accepts (na|eu, 30d|60d|90d|all).
  if (
    /\b(stat|statistic)s?\b.*\b(leader|top|best)\b|\bleaderboard\b|\br2\.?0\b/i.test(low) ||
    /\b(?:top|best)\s+(?:fragger|fraggers|frag|player|players)\b/i.test(low)
  ) {
    const r = /\b(na|eu|emea|europe|americas|north america)\b/i.exec(low);
    const region = r ? r[1].replace(/\s+/g, "-") : "";
    const span = /\ball[\s-]?time\b/i.test(low) ? "all"
      : /\b90\b/.test(low) ? "90d"
      : /\b60\b/.test(low) ? "60d"
      : /\b30\b|\bthis month\b/i.test(low) ? "30d"
      : "";
    return { kind: "stats", query: region || span ? `${region}:${span}` : "", via: "keyword" };
  }

  // "who's winning" with no team named is a question about the live slate.
  if (
    /\blive\b.*\bmatch|match.*\blive\b|playing (right )?now|on right now/i.test(low) ||
    /\bwhat'?s live\b|\banything live\b|\bany (?:games?|matches?) (?:on|going|live)\b|\bwho'?s winning\b/i.test(low)
  )
    return { kind: "live", query: "", via: "keyword" };
  if (/\bupcoming\b|\bnext match|\bschedule\b|who plays next/i.test(low))
    return { kind: "upcoming", query: "", via: "keyword" };
  if (/\bresults?\b|\bscores?\b|\bwho won\b|\blast match\b/i.test(low))
    return { kind: "results", query: "", via: "keyword" };
  if (/\bevents?\b|\btournaments?\b|\bwhat'?s on this week\b|\brunning this week\b/i.test(low))
    return { kind: "events", query: "", via: "keyword" };

  // "player <name>" / "<name>'s stats"
  const player = /\bplayer\s+([A-Za-z0-9_.\- ]{2,24})/i.exec(m)
    ?? /\b([A-Za-z0-9_.\-]{2,20})(?:'s|s')\s+(?:stats|numbers|performance|rating)/i.exec(m);
  if (player) return { kind: "player", query: cleanEntity(player[1]), via: "keyword" };

  const team = /\bteam\s+([A-Za-z0-9_.\- ]{2,28})/i.exec(m);
  if (team) {
    // Name-aware cleaning, so a grammar capture ("what's up with a team that
    // does not exist" -> "that") is dropped rather than spent on a lookup: the
    // team search is fuzzy and happily resolves "that" to a real team.
    const name = cleanTeamName(team[1]);
    if (name) return { kind: "team", query: name, via: "keyword" };
  }

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
    const rawQuery = String(obj?.query ?? "");
    // Team kinds get the name-aware cleaner so "The Spiders" survives.
    const query = kind === "team" || kind === "team-match" || kind === "team-rank"
      ? cleanTeamName(rawQuery)
      : cleanEntity(rawQuery);
    return { kind, query: query.slice(0, 60), via: "prepass" };
  } catch {
    return { kind: "none", query: "", via: "none" };
  }
}

export const PREPASS_PROMPT = (message: string) =>
  [
    "You are an intent classifier. Reply with ONE line of JSON and nothing else.",
    'Schema: {"lookup":"player|team|match|rankings|stats|results|upcoming|live|events|team-match|team-rank|none","query":"<name/id/region or empty>"}',
    'Use "team-match" for a question about ONE named team\'s current, next or last game (is X playing, who is winning, how did X do) with query=<team name>.',
    'Use "team-rank" for where ONE named team sits in the standings, query=<team name>.',
    'Use "live" for the whole live slate, "events" for tournaments, "stats" for player leaderboards.',
    'If the question does not need a specific Valorant esports lookup, reply {"lookup":"none","query":""}.',
    "",
    `Question: ${message}`
  ].join("\n");

/** Execute the chosen lookup, or nothing. */
export async function performLookup(intent: Intent): Promise<LookupResult | null> {
  if (!esportsEnabled() || intent.kind === "none") return null;
  return runVlrLookup(intent.kind, intent.query);
}
