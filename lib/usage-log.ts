import { appendFile, mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

/**
 * The dashboard's own per-turn usage record.
 *
 * OpenClaw keeps its own history; this is the complement — one JSONL line per
 * assistant turn, so the live layer becomes history too and survives reloads
 * and restarts.
 *
 * PRIVACY: strictly numeric/identifier fields. The agent's --json payload also
 * carries finalAssistantVisibleText, the system prompt report and workspace
 * file paths; none of that is read here, so no message content or filesystem
 * layout can reach this file.
 */

const DATA_DIR = process.env.USAGE_DATA_DIR || path.join(process.cwd(), "data");
const LOG_PATH = path.join(DATA_DIR, "usage.jsonl");

/** Bound the file so it can never grow without limit. */
const MAX_TURNS = 500;
/** Only compact once we're meaningfully over, to avoid rewriting every turn. */
const COMPACT_AT = 650;

export interface UsageTurn {
  ts: number;
  backend: "sol" | "claude";
  ok: boolean;
  durationMs: number | null;
  model: string | null;
  provider: string | null;
  sessionId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  contextTokens: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
  promptTokens: number | null;
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/**
 * Pull ONLY the numeric usage meta out of an `openclaw agent --json` payload.
 * Everything else in that payload — reply text, prompts, paths — is ignored.
 */
export function extractSolUsage(parsed: unknown): Partial<UsageTurn> {
  const root = parsed as Record<string, any> | null;
  const meta = root?.result?.meta ?? {};
  const agent = meta?.agentMeta ?? {};
  const usage = agent?.usage ?? {};
  const lastCall = agent?.lastCallUsage ?? {};

  return {
    durationMs: num(meta?.durationMs),
    model: str(agent?.model),
    provider: str(agent?.provider),
    sessionId: str(agent?.sessionId),
    inputTokens: num(usage?.input),
    outputTokens: num(usage?.output),
    totalTokens: num(usage?.total),
    contextTokens: num(agent?.contextTokens),
    cacheRead: num(usage?.cacheRead ?? lastCall?.cacheRead),
    cacheWrite: num(lastCall?.cacheWrite),
    promptTokens: num(agent?.promptTokens)
  };
}

// Appending and compacting must be one critical section. Without this queue,
// one request can append after another request has read the file but before it
// rewrites the compacted tail, silently erasing the newer record.
let writeQueue: Promise<void> = Promise.resolve();

/** Append one turn. Never throws — usage logging must not break a reply. */
export async function recordTurn(turn: UsageTurn): Promise<void> {
  const operation = writeQueue.then(async () => {
    try {
      await mkdir(DATA_DIR, { recursive: true });
      await appendFile(LOG_PATH, `${JSON.stringify(turn)}\n`, "utf8");
      await compactIfNeeded();
    } catch (err) {
      console.error("usage log write failed:", err instanceof Error ? err.message : err);
    }
  });
  writeQueue = operation.catch(() => undefined);
  await operation;
}

async function compactIfNeeded(): Promise<void> {
  try {
    const raw = await readFile(LOG_PATH, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    if (lines.length <= COMPACT_AT) return;
    await writeFile(LOG_PATH, `${lines.slice(-MAX_TURNS).join("\n")}\n`, "utf8");
  } catch {
    /* nothing to compact */
  }
}

/** Read back the most recent turns, oldest first. */
export async function readTurns(limit = MAX_TURNS): Promise<UsageTurn[]> {
  // Give callers a stable snapshot rather than reading halfway through a
  // queued append/compaction cycle.
  await writeQueue;
  try {
    const raw = await readFile(LOG_PATH, "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .slice(-limit)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as UsageTurn];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

export const USAGE_LIMITS = { MAX_TURNS, COMPACT_AT };
