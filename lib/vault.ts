import { appendFile, readdir, readFile, stat } from "fs/promises";
import { resolve, sep } from "path";
import { formatBullet, sanitizeBulletText } from "@/lib/vault-write";

/**
 * PROJECT STATUS feed — the shared Obsidian vault, read straight off the local
 * bind mount.
 *
 * This replaces the cc-projects SSH read (lib/projects.ts): the same idea, a
 * better transport. The vault at /mnt/vault is bind-mounted into this container
 * and the service user can read it, so there is no network hop, no third
 * restricted key to maintain, and the richer per-project files are available
 * instead of one combined PROJECTS.md.
 *
 * Reads are the bulk of this module; the one write path, appendBullet, is
 * APPEND-ONLY and is documented at its own definition below.
 *
 * This rides on the chat snapshot, which is rebuilt on EVERY message, so:
 *   * the parsed set is cached in-process for 10 minutes,
 *   * every failure mode (mount absent, file gone, read throws) degrades to
 *     "no vault context" rather than propagating.
 * A vault problem must never break chat.
 */

/** One source of truth for the path — nothing reads the location literally. */
export const VAULT_DIR = process.env.VAULT_DIR || "/mnt/vault/Projects";

/**
 * Project files change at human speed (someone typing in Obsidian); re-reading
 * six files per message is waste. Overridable so tests and diagnostics don't
 * have to wait ten minutes for an invalidation.
 */
const TTL_MS = Number(process.env.VAULT_TTL_MS) > 0
  ? Number(process.env.VAULT_TTL_MS)
  : 10 * 60 * 1000;

/**
 * A project name is a plain basename and nothing else. Names reach this module
 * from callers today and from assistant-supplied text in a later stage, so the
 * allowed shape is stated positively: anything with a slash, a dot, a leading
 * separator or a traversal segment fails here before any path is built.
 */
const SAFE_NAME = /^[A-Za-z0-9_-]+$/;

/** Guard against a symlinked or oddly-cased VAULT_DIR by comparing resolved paths. */
const ROOT = resolve(/* turbopackIgnore: true */ VAULT_DIR);

/**
 * The absolute path of one project file, or null if `name` is not a plain
 * basename or would escape the vault directory.
 *
 * Two independent checks, deliberately: the pattern rejects the shapes that
 * could traverse, and the resolved path is then confirmed to still sit under
 * the vault root. Either alone would do; both means a future loosening of the
 * pattern cannot silently become an arbitrary-file read.
 */
export function resolveProjectPath(name: string): string | null {
  if (typeof name !== "string" || !SAFE_NAME.test(name)) return null;
  const full = resolve(ROOT, `${name}.md`);
  if (full !== ROOT && !full.startsWith(ROOT + sep)) return null;
  return full;
}

interface VaultCache {
  at: number;
  /** name -> raw markdown, in directory order. */
  files: Map<string, string>;
}

let cache: VaultCache | null = null;
/** Coalesces concurrent misses into a single pass over the directory. */
let inflight: Promise<VaultCache> | null = null;

async function load(): Promise<VaultCache> {
  const files = new Map<string, string>();
  try {
    const entries = await readdir(/* turbopackIgnore: true */ ROOT);
    const names = entries
      .filter((e) => !e.startsWith(".") && e.toLowerCase().endsWith(".md"))
      .map((e) => e.slice(0, -3))
      .filter((n) => SAFE_NAME.test(n))
      .sort();

    // One file failing (permissions, a rename mid-read) must not lose the rest.
    await Promise.all(
      names.map(async (name) => {
        const path = resolveProjectPath(name);
        if (!path) return;
        try {
          files.set(name, await readFile(path, "utf8"));
        } catch {
          /* skip this file */
        }
      })
    );
  } catch (err) {
    // No mount, no directory, no permission: an empty vault, not an error.
    console.warn(
      "vault read failed:",
      err instanceof Error ? err.message : err,
      `(VAULT_DIR=${VAULT_DIR} — omitting project context)`
    );
  }
  // Map iteration follows insertion order, and Promise.all resolves out of
  // order, so re-key by the sorted names for a stable digest.
  const ordered = new Map([...files.entries()].sort(([a], [b]) => a.localeCompare(b)));
  const entry: VaultCache = { at: Date.now(), files: ordered };
  cache = entry;
  return entry;
}

async function current(): Promise<VaultCache> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  if (!inflight) {
    inflight = load().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/**
 * The project files available in the vault, as basenames without `.md`.
 * Empty when the mount is absent — never throws.
 */
export async function listProjects(): Promise<string[]> {
  const { files } = await current();
  return [...files.keys()];
}

/**
 * The markdown of one project file, or null when the name is rejected by the
 * path guard or the file is not in the vault. Never throws.
 */
export async function readProject(name: string): Promise<string | null> {
  if (!resolveProjectPath(name)) return null;
  const { files } = await current();
  return files.get(name) ?? null;
}

/** Test/diagnostic helper — forces the next read to go back to the mount. */
export function clearVaultCache(): void {
  cache = null;
}

// --- Append (the only write path) -----------------------------------------

/**
 * THREE writers touch these files: this app, OpenClaw on 152, and the human in
 * Obsidian on Mew over Samba. All three can write at any moment.
 *
 * That is why this is the only write in the codebase and why it is APPEND-ONLY.
 * A read-modify-write — load the file, splice a line in, write it back — loses
 * whatever the other two wrote in between, silently. Opening with O_APPEND and
 * issuing ONE write instead hands the kernel the job of placing the bytes at
 * the current end of file, so a concurrent append lands after ours rather than
 * on top of it, and existing content is never rewritten at all.
 *
 * Consequences accepted deliberately:
 *   * No dedupe across writers. Detecting "this bullet already exists" needs a
 *     read-modify-write to be race-free; a duplicate dated bullet is harmless
 *     and a lost edit is not.
 *   * The file IS read first, to decide whether a `## Log` heading is needed
 *     and whether the file ends in a newline. Reading is not the dangerous
 *     half — nothing existing is ever rewritten. The worst a race does here is
 *     produce two `## Log` headings, which is cosmetic.
 */

/** Where dated bullets live. Its own section, at the end of the file. */
const LOG_HEADING = "## Log";

export interface AppendResult {
  ok: boolean;
  /** The exact line written. Authoritative — the UI previews, this decides. */
  line?: string;
  error?: string;
}

/**
 * Append one dated bullet to a project note.
 *
 * Bullets go under a `## Log` section rather than at the raw end of file,
 * because five of the six notes END with `## Open items / TODO` — appending to
 * EOF would file every log entry as an outstanding task. The heading is added
 * by the same single append when the file does not already end in that
 * section, so the write stays one syscall and never rewrites a byte.
 *
 * A well-formed name whose file does not exist is REJECTED, not created: the
 * vault is a human-curated Obsidian folder, and a typo should not litter it
 * with a new note.
 */
export async function appendBullet(name: string, text: string): Promise<AppendResult> {
  // The read guard, reused — path validation lives in exactly one place.
  const path = resolveProjectPath(name);
  if (!path) return { ok: false, error: "invalid project name" };

  const body = sanitizeBulletText(text);
  if (!body) return { ok: false, error: "empty bullet text" };

  const line = formatBullet(body);

  try {
    // Existence is checked on disk, not through the cache: the cache can be up
    // to a TTL stale, and creating a note by accident is the thing to avoid.
    const info = await stat(path);
    if (!info.isFile()) return { ok: false, error: "not a project note" };

    const current = await readFile(path, "utf8");
    const needsNewline = current.length > 0 && !current.endsWith("\n");
    // Is `## Log` the LAST heading? If the human added a section after it, a
    // plain EOF append would land the bullet in their section instead.
    const headings = current.match(/^#{1,6} .*$/gm) ?? [];
    const inLogSection = headings[headings.length - 1]?.trim() === LOG_HEADING;

    const block =
      (needsNewline ? "\n" : "") +
      (inLogSection ? "" : `${current.length ? "\n" : ""}${LOG_HEADING}\n\n`) +
      `${line}\n`;

    // ONE call, O_APPEND: the kernel places these bytes at the current end of
    // file. No truncation, no offset we chose, nothing existing touched.
    await appendFile(path, block, { encoding: "utf8", flag: "a" });

    // The new bullet must be visible to /vault and to the chat snapshot now,
    // not in up to TTL_MS. Cheap: the next read re-loads six small files.
    clearVaultCache();
    return { ok: true, line };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    console.warn("vault append failed:", code ?? err, `(${name})`);
    if (code === "ENOENT") return { ok: false, error: "no such project note" };
    if (code === "EACCES" || code === "EPERM" || code === "EROFS") {
      return { ok: false, error: "vault is not writable" };
    }
    return { ok: false, error: "vault write failed" };
  }
}

// --- Trim -----------------------------------------------------------------

/** The master list. Short by design, so it goes in whole. */
const INDEX = "_index";

/**
 * Section headings that carry lifecycle information — what phase a project is
 * in, what is left, what bit users. The rest of each file (architecture, tech
 * stack, visual direction, network boundary) is what makes the vault 13KB and
 * none of it answers "what phase is this in".
 */
const STATUS_HEADING =
  /^(status|open items|todo|open items \/ todo|known caveats|caveats|next|remaining|progress|roadmap|milestones?)\b/i;

/** Per-project budgets. Generous enough to survive a "…, then X, then Y" tail. */
const MAX_LEAD_CHARS = 240;
const MAX_SECTION_CHARS = 420;
const MAX_BULLET_CHARS = 180;
const MAX_BULLETS = 4;
const MAX_PROJECT_CHARS = 900;
/** Token budget for what actually gets injected, not for the files. */
const MAX_DIGEST_CHARS = 4000;

const flatten = (text: string) =>
  text
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1") // wiki-links are noise to the model
    .replace(/\*+/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Clip to `max`, preferring a sentence boundary. A status line ends with the
 * part that matters ("not yet deployed in its own LXC"), so a mid-sentence cut
 * loses exactly the "what's next" this feature exists to surface — dropping a
 * whole trailing sentence is the cheaper loss.
 */
function clip(text: string, max: number): string {
  const flat = flatten(text);
  if (flat.length <= max) return flat;
  const head = flat.slice(0, max);
  const lastStop = Math.max(head.lastIndexOf(". "), head.lastIndexOf("; "));
  if (lastStop > max * 0.5) return head.slice(0, lastStop + 1);
  return `${head.replace(/\s+\S*$/, "")}…`;
}

interface Block {
  heading: string;
  /** Level 1 is the file title; its body is the lead description. */
  level: number;
  lines: string[];
  bullets: string[];
}

/** Split one project file into heading blocks, dropping fenced code entirely. */
function splitBlocks(raw: string): Block[] {
  const blocks: Block[] = [];
  let current: Block | null = null;
  let inFence = false;

  for (const line of raw.split("\n")) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const h = line.match(/^(#{1,6})\s+(.*\S)\s*$/);
    if (h) {
      current = { heading: flatten(h[2]), level: h[1].length, lines: [], bullets: [] };
      blocks.push(current);
      continue;
    }
    if (!current) continue;

    const text = line.trim();
    if (!text || /^([-=*_])\1{2,}$/.test(text)) continue;
    if (/^[-*+]\s+/.test(text)) current.bullets.push(text.replace(/^[-*+]\s+/, ""));
    else current.lines.push(text);
  }
  return blocks;
}

/**
 * One project file down to its lifecycle lines: what it is in a sentence, plus
 * whatever it says about status, caveats and open items.
 */
export function summarizeProject(name: string, raw: string): string {
  const blocks = splitBlocks(raw);
  const kept: string[] = [];

  // The lead: prose directly under the title, or the title block's bullets for
  // files written as a flat list (homelab.md).
  const title = blocks.find((b) => b.level === 1);
  const lead = title?.lines[0] ?? title?.bullets[0];
  if (lead) kept.push(clip(lead, MAX_LEAD_CHARS));

  for (const block of blocks) {
    if (block.level === 1 || !STATUS_HEADING.test(block.heading)) continue;
    const body: string[] = [];
    if (block.lines.length) body.push(clip(block.lines.join(" "), MAX_SECTION_CHARS));
    for (const b of block.bullets.slice(0, MAX_BULLETS)) body.push(`- ${clip(b, MAX_BULLET_CHARS)}`);
    if (!body.length) continue;
    kept.push(`${block.heading}:`);
    for (const line of body) kept.push(`  ${line}`);
  }

  if (!kept.length) return "";

  let text = kept.map((l) => `  ${l}`).join("\n");
  if (text.length > MAX_PROJECT_CHARS) {
    text = `${text.slice(0, MAX_PROJECT_CHARS).replace(/\s+\S*$/, "")}…`;
  }
  return `## ${name}\n${text}`;
}

/**
 * The whole vault trimmed into one bounded digest: the master index verbatim
 * (it is the short cross-project list, and it names what exists), then the
 * lifecycle lines from each project file.
 */
export function summarizeVault(files: Map<string, string>, maxChars = MAX_DIGEST_CHARS): string {
  const out: string[] = [];

  const index = files.get(INDEX);
  if (index?.trim()) {
    out.push("## index");
    for (const line of index.split("\n")) {
      const text = flatten(line.replace(/^#{1,6}\s+/, ""));
      if (text) out.push(`  ${text}`);
    }
  }

  for (const [name, raw] of files) {
    if (name === INDEX) continue;
    const section = summarizeProject(name, raw);
    if (section) out.push(section);
  }

  let text = out.join("\n").trim();
  if (text.length > maxChars) {
    text = `${text.slice(0, maxChars).replace(/\s+\S*$/, "")}\n  … (truncated — fuller detail is in the vault at ${VAULT_DIR})`;
  }
  return text;
}

/**
 * Trimmed project status for the chat snapshot, or null when the vault is
 * unreadable or empty. Never throws, never blocks on the network.
 */
export async function getVaultProjectStatus(): Promise<string | null> {
  const { files } = await current();
  if (!files.size) return null;
  const text = summarizeVault(files);
  return text || null;
}
