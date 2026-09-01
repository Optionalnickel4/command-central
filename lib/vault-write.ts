/**
 * The pure half of vault write-back: what a bullet looks like, and when the
 * user has asked for one.
 *
 * Separate from lib/vault.ts because that module imports `fs` and this one runs
 * in the BROWSER too — the proposal card previews the exact line before it is
 * written, and the only way to guarantee the preview matches the write is for
 * both sides to format it with the same function.
 *
 * Nothing here touches disk, and nothing here decides to write. It turns a
 * message into a PROPOSAL; a human clicking confirm is what causes a write.
 */

/** Project names are the vault's basenames — same shape the read guard allows. */
const NAME = /^[A-Za-z0-9_-]+$/;

/**
 * A bullet is one line. That is a safety property, not a style preference:
 * the append path writes a single line into a file two other writers are also
 * appending to, and text carrying a newline could forge a second bullet that
 * looks like it came from somewhere else.
 */
export const MAX_BULLET_TEXT = 500;

/**
 * Collapse arbitrary text to one safe line.
 *
 * Newlines and control characters become spaces rather than being dropped, so
 * "a\n- forged bullet" reads as "a - forged bullet" — visibly one bullet, with
 * nothing silently deleted. A leading bullet marker is stripped so the result
 * is never "- [date] - text".
 */
export function sanitizeBulletText(raw: string): string {
  const flat = String(raw ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^\s*[-*+]\s+/, "")
    .trim();
  if (flat.length <= MAX_BULLET_TEXT) return flat;

  // Prefer a word boundary, but only when one is actually near the cap. A
  // single unbroken 2000-character token has no whitespace to cut back to, and
  // trimming the partial word would throw the whole token away — same >50%
  // guard the trim helpers elsewhere in the repo use.
  const head = flat.slice(0, MAX_BULLET_TEXT);
  const lastSpace = head.lastIndexOf(" ");
  const cut = lastSpace > MAX_BULLET_TEXT * 0.5 ? head.slice(0, lastSpace) : head;
  return `${cut}…`;
}

/** Local date, not UTC: someone reading the vault thinks in the box's day. */
export function isoDate(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * The line that gets appended. The dated-bullet convention the vault handoff
 * documents, and the format OpenClaw is expected to use, so entries from both
 * agents sit in one list and read alike.
 */
export function formatBullet(text: string, date: Date = new Date()): string {
  return `- [${isoDate(date)}] ${sanitizeBulletText(text)}`;
}

/** A write the user has not yet approved. */
export interface Proposal {
  project: string;
  text: string;
  /** Preview of the exact line; the server returns the authoritative one. */
  line: string;
  /** Explicit request, or something we offered unprompted. */
  via: "explicit" | "offered";
}

/** Case-insensitive resolve against the vault's actual note names. */
function resolveProject(raw: string, projects: string[]): string | null {
  if (!NAME.test(raw)) return null;
  const low = raw.toLowerCase();
  return projects.find((p) => p.toLowerCase() === low) ?? null;
}

/**
 * "log to vlr-api: migrated to the new host"
 * "add a note to command-central that the vault is wired up"
 *
 * Deliberately narrow. The separator must be a colon, "that" or "saying" —
 * a dash would be ambiguous against hyphenated project names, and a comma
 * catches ordinary prose. An unrecognised project name is NOT a log request:
 * it falls through to normal chat rather than proposing a write to a file that
 * does not exist.
 */
const EXPLICIT =
  /^\s*(?:please\s+)?(?:log|note|record|append|add|write|put|jot)\b(?:\s+(?:a|an|this|that|it)\b)?(?:\s+(?:note|log|line|bullet|entry|item))?\s+(?:to|in|on|under|into)\s+(?:the\s+)?([A-Za-z0-9_-]+?)(?:\.md)?\s*(?::\s*|\s+that\s+|\s+saying\s+)(.+)$/is;

export function parseLogRequest(message: string, projects: string[]): Proposal | null {
  const m = EXPLICIT.exec(message ?? "");
  if (!m) return null;

  const project = resolveProject(m[1], projects);
  if (!project) return null;

  const text = sanitizeBulletText(m[2]);
  if (!text) return null;

  return { project, text, line: formatBullet(text), via: "explicit" };
}

/**
 * Verbs that mark a fact worth keeping — a thing that CHANGED and will still be
 * true tomorrow. Deliberately short: "is running" or "looks good" are status,
 * not history, and offering to log them would be noise.
 */
const DURABLE =
  /\b(moved|migrated|relocated|deployed|redeployed|shipped|launched|released|renamed|replaced|retired|decommissioned|upgraded|downgraded|switched|swapped|rebuilt|reinstalled|cut over|rolled out|went live|now runs?|now lives?|now serves?|is now|are now)\b/i;

/** Anything interrogative — a question about a change is not a record of one. */
const QUESTION = /\?\s*$|^\s*(?:what|when|where|why|how|who|which|did|does|do|is|are|was|were|can|could|should|would|will|has|have|any)\b/i;

/**
 * The offered path: the user stated a durable project fact in passing, so we
 * offer to write it down. Their own words become the bullet.
 *
 * Conservative on purpose — a proposal the user did not want is friction on
 * every turn, so this needs a known project name AND a change verb AND a
 * declarative sentence. Under-offering is the intended failure mode.
 */
export function detectDurableFact(message: string, projects: string[]): Proposal | null {
  const msg = String(message ?? "").trim();
  if (msg.length < 12 || msg.length > 400) return null;
  if (QUESTION.test(msg)) return null;
  if (!DURABLE.test(msg)) return null;
  // An explicit request is handled by the other path; never propose twice.
  if (EXPLICIT.test(msg)) return null;

  // The project must be named as its own word, so "api" inside a sentence
  // cannot match "vlr-api" and vice versa.
  const named = projects
    .filter((p) => p !== "_index")
    .filter((p) => new RegExp(`(?:^|[^A-Za-z0-9_-])${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9_-])`, "i").test(msg));
  // Two projects mentioned is ambiguous about which file it belongs in.
  if (named.length !== 1) return null;

  const text = sanitizeBulletText(msg);
  if (!text) return null;

  return { project: named[0], text, line: formatBullet(text), via: "offered" };
}
