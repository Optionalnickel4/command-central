import { execFile } from "child_process";

/**
 * RETIRED — nothing in the app calls this module any more.
 *
 * Project-status context now comes from the shared Obsidian vault on the local
 * bind mount (lib/vault.ts), which the context snapshot reads instead. Same
 * context, no SSH round trip to 152, no third restricted key in the request
 * path, and richer per-project files instead of one combined document.
 *
 * Kept in the tree (with its tests) because the wrapper and key still exist on
 * 152 and this is the only record of how they were driven — deleting it would
 * make re-wiring the SSH read a rewrite rather than a one-line import swap. If
 * the cc-projects key is retired on 152, this file can go with it.
 *
 * PROJECT STATUS feed — the canonical PROJECTS.md that lives on LXC 152.
 *
 * PROJECTS.md is a FILE on 152, not an HTTP endpoint, so it is read over SSH
 * the same way the chat (cc-agent) and stats (cc-stats) links already are —
 * over a THIRD, separate key (cc_projects) whose authorized_keys forced command
 * on 152 is locked to exactly one invocation:
 *
 *     cat /root/.openclaw/workspace/PROJECTS.md
 *
 * Nothing user-supplied ever reaches it: the only argument this module can send
 * is the literal keyword "projects", and the wrapper on 152 independently
 * refuses anything else. Neither existing key is reused or widened.
 *
 * This rides on the chat snapshot, which is rebuilt on EVERY message, so:
 *   * the content is cached in-process for 10 minutes,
 *   * the SSH call is capped at a few seconds, and
 *   * a timeout or failure falls back to the last good copy, or omits the
 *     section entirely. A slow or down 152 must never hang or break chat.
 */

const KEY = process.env.PROJECTS_SSH_KEY || "/home/builder/.ssh/cc_projects";
const HOST = process.env.OPENCLAW_SSH_HOST || "10.0.0.152";

/** The one word the wrapper on 152 accepts. */
const COMMAND = "projects";

/** Short by design — chat waits on this, so it must fail fast. */
const FETCH_TIMEOUT_MS = 4000;
const MAX_BUFFER = 512 * 1024; // PROJECTS.md is ~15KB; leave plenty of headroom
/**
 * PROJECTS.md changes at human speed; re-reading it per message is waste.
 * Overridable so the stale-cache fallback can be exercised without waiting
 * ten minutes for it.
 */
const TTL_MS = Number(process.env.PROJECTS_TTL_MS) > 0
  ? Number(process.env.PROJECTS_TTL_MS)
  : 10 * 60 * 1000;
/** Token budget for what actually gets injected, not for the file. */
const MAX_SUMMARY_CHARS = 3000;

interface CacheEntry {
  at: number;
  raw: string;
  summary: string;
}

let cache: CacheEntry | null = null;
/** Coalesces concurrent misses into a single SSH round trip. */
let inflight: Promise<CacheEntry | null> | null = null;

function run(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "ssh",
      [
        "-i", KEY,
        "-o", "StrictHostKeyChecking=accept-new",
        "-o", "BatchMode=yes",
        "-o", "ConnectTimeout=3",
        `root@${HOST}`,
        COMMAND
      ],
      { timeout: FETCH_TIMEOUT_MS, maxBuffer: MAX_BUFFER },
      (err, stdout) => (err ? reject(err) : resolve(stdout))
    );
  });
}

/**
 * Paragraph labels that carry lifecycle info. PROJECTS.md leads each paragraph
 * with a bold label ("**Build status.**", "**Phase status.**"); these are the
 * ones worth spending context on. "**What it is.**", "**Data model.**" and the
 * architecture paragraphs are not — the assistant needs phase, not design.
 */
const STATUS_LABEL =
  /^\s*(?:[-*+]\s+)?\*{0,2}(status|phase|build status|state|stage|progress|next|remaining|current|now|shipped|done|blocked|milestone|eta|target|roadmap)\b/i;

/** Per-project budgets. Generous enough to survive "…, then X, then Y" tails. */
const MAX_STATUS_CHARS = 520;
const MAX_FALLBACK_CHARS = 220;
const MAX_BULLET_CHARS = 200;
const MAX_BULLETS = 5;

/** `## 4. "Clarifying bot-api identity" → **vlr-api / valstats** (Valorant)` → `vlr-api / valstats (Valorant)` */
function cleanHeading(text: string): string {
  const arrow = text.lastIndexOf("\u2192");
  const tail = arrow >= 0 ? text.slice(arrow + 1) : text;
  return tail
    .replace(/\*+/g, "")
    .replace(/^\s*\d+[.)]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

const flatten = (text: string) =>
  text.replace(/\*+/g, "").replace(/`/g, "").replace(/\s+/g, " ").trim();

/**
 * Clip to `max`, preferring a sentence boundary. Status paragraphs end with the
 * part that matters ("Remaining: X, then Y, then Z."), so a mid-sentence cut
 * loses exactly the "what's next" this whole feature exists to surface —
 * dropping a whole trailing sentence is the cheaper loss.
 */
function clip(text: string, max: number): string {
  const flat = flatten(text);
  if (flat.length <= max) return flat;
  const head = flat.slice(0, max);
  const lastStop = Math.max(head.lastIndexOf(". "), head.lastIndexOf("; "));
  if (lastStop > max * 0.5) return head.slice(0, lastStop + 1);
  return `${head.replace(/\s+\S*$/, "")}\u2026`;
}

interface Section {
  level: number;
  heading: string;
  paragraphs: string[];
  bullets: string[];
}

/** Split the markdown into sections, dropping fenced code entirely. */
function splitSections(raw: string): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  let inFence = false;

  for (const line of raw.split("\n")) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const h = line.match(/^(#{1,6})\s+(.*\S)\s*$/);
    if (h) {
      current = { level: h[1].length, heading: cleanHeading(h[2]), paragraphs: [], bullets: [] };
      sections.push(current);
      continue;
    }
    if (!current) continue;

    const text = line.trim();
    if (!text || /^([-=*_])\1{2,}$/.test(text)) continue;
    if (/^[-*+]\s+/.test(text)) current.bullets.push(text.replace(/^[-*+]\s+/, ""));
    else current.paragraphs.push(text);
  }
  return sections;
}

/**
 * Trim ~15KB of markdown down to the per-project status lines.
 *
 * Per project: the name, plus its status/phase paragraphs — or, where a section
 * is a compact list (the "how these fit together" cross-cutting notes), its
 * bullets. Architecture, data models and legal posture are dropped; they are
 * what makes the file 15KB and none of it answers "what phase is this in".
 */
export function summarizeProjects(raw: string, maxChars = MAX_SUMMARY_CHARS): string {
  const out: string[] = [];

  for (const section of splitSections(raw)) {
    const kept: string[] = [];

    const status = section.paragraphs.filter((p) => STATUS_LABEL.test(p));
    for (const p of status.slice(0, 2)) kept.push(clip(p, MAX_STATUS_CHARS));

    // A bulleted section is already a summary — keep it, trimming long ones
    // rather than dropping them (the cross-cutting "what's still open" note is
    // one of the longest bullets in the file).
    for (const b of section.bullets.slice(0, MAX_BULLETS)) kept.push(`- ${clip(b, MAX_BULLET_CHARS)}`);

    // Nothing labelled: one line of prose beats naming a project and saying
    // nothing about it. The document title (level 1) gets no such courtesy —
    // its preamble describes the file, not a project.
    if (!kept.length && section.level > 1 && section.paragraphs.length) {
      kept.push(clip(section.paragraphs[0], MAX_FALLBACK_CHARS));
    }
    if (!kept.length || !section.heading) continue;

    out.push(`## ${section.heading}`);
    for (const line of kept) out.push(`  ${line}`);
  }

  let text = out.join("\n").trim();
  if (text.length > maxChars) {
    text = `${text.slice(0, maxChars).replace(/\s+\S*$/, "")}\n  \u2026 (truncated \u2014 fuller detail lives in PROJECTS.md on 152)`;
  }
  return text;
}

async function refresh(): Promise<CacheEntry | null> {
  try {
    const raw = await run();
    if (!raw.trim()) throw new Error("PROJECTS.md came back empty");
    const entry: CacheEntry = { at: Date.now(), raw, summary: summarizeProjects(raw) };
    cache = entry;
    return entry;
  } catch (err) {
    // Stale beats absent: a 10-minute-old status is still true enough, and a
    // down 152 must not cost the user their answer.
    console.warn(
      "cc-projects fetch failed:",
      err instanceof Error ? err.message : err,
      cache ? "(serving cached copy)" : "(no cache — omitting project status)"
    );
    return cache;
  }
}

/**
 * Trimmed project status, or null when 152 is unreachable and nothing is
 * cached. Never throws, never blocks longer than the fetch timeout.
 */
export async function getProjectStatus(): Promise<string | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.summary;
  if (!inflight) {
    inflight = refresh().finally(() => {
      inflight = null;
    });
  }
  const entry = await inflight;
  return entry ? entry.summary : null;
}

/** Test/diagnostic helper — forces the next read to go back to 152. */
export function clearProjectCache(): void {
  cache = null;
}
