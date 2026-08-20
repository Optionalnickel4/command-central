import { execFile } from "child_process";

/**
 * Read-only OpenClaw stats client.
 *
 * Talks to LXC 152 over a SEPARATE key from the chat wrapper
 * (openclaw_stats, not openclaw_agent), whose authorized_keys forced command is
 * /usr/local/bin/cc-stats — an allowlist of exactly four read-only commands.
 *
 * Nothing user-supplied ever reaches this: routes pass one of four literal
 * keywords, and the union type plus the runtime guard below make anything else
 * unrepresentable. The wrapper on 152 enforces the same list independently.
 */

export type StatsCommand = "status" | "sessions" | "audit" | "capability";

const ALLOWED: readonly StatsCommand[] = ["status", "sessions", "audit", "capability"];

const KEY = process.env.OPENCLAW_STATS_KEY || "/home/builder/.ssh/openclaw_stats";
const HOST = process.env.OPENCLAW_SSH_HOST || "10.0.0.152";
const TIMEOUT_MS = 20000;
const MAX_BUFFER = 4 * 1024 * 1024; // audit alone is ~65KB; leave headroom

function run(command: StatsCommand): Promise<string> {
  return new Promise((resolve, reject) => {
    // Defence in depth — the wrapper is the real gate, but never let an
    // unexpected value leave this process.
    if (!ALLOWED.includes(command)) return reject(new Error("command not allowed"));
    execFile(
      "ssh",
      [
        "-i", KEY,
        "-o", "StrictHostKeyChecking=accept-new",
        "-o", "BatchMode=yes",
        "-o", "ConnectTimeout=10",
        `root@${HOST}`,
        command
      ],
      { timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER },
      (err, stdout) => (err ? reject(err) : resolve(stdout))
    );
  });
}

/** Per-command server-side cache so several open tabs share one SSH round trip. */
const cache = new Map<StatsCommand, { at: number; value: string }>();

export async function ccStats(command: StatsCommand, ttlMs: number): Promise<string> {
  const hit = cache.get(command);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await run(command);
  cache.set(command, { at: Date.now(), value });
  return value;
}

/** `capability` returns JSONL (one object per line), not a JSON array. */
export function parseJsonLines<T>(raw: string): T[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as T];
      } catch {
        return [];
      }
    });
}

/**
 * Absolute filesystem paths leak the host's layout and add nothing to a stats
 * page. Session KEYS and ids are kept; `.jsonl` paths and install roots are not.
 */
export function stripPaths<T>(value: T): T {
  const DROP = new Set([
    "sessionFile", "path", "paths", "root", "lockfilePath", "markerPath", "url"
  ]);
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (DROP.has(k)) continue;
        out[k] = walk(v);
      }
      return out;
    }
    return node;
  };
  return walk(value) as T;
}
