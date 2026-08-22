import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { extractSolUsage, recordTurn, type UsageTurn } from "@/lib/usage-log";
import { withContext } from "@/lib/context-snapshot";
import {
  PREPASS_PROMPT, looksLikeEsports, parseIntent, parsePrepass, performLookup
} from "@/lib/lookup-intent";

/**
 * Two assistant backends behind one interface. Both resolve to the same
 * `{ reply }` shape the console expects, so the orb's
 * thinking → speaking → idle lifecycle is identical either way.
 *
 *   "sol"    → SSH to the OpenClaw agent on 10.0.0.152 (unchanged transport).
 *   "claude" → headless Claude Code on this box, via the builder user's
 *              existing Pro/Max login (no API key involved).
 *
 * Each backend has exactly one function that talks to it — no other path in
 * the app reaches either one.
 */
export type AssistantBackend = "sol" | "claude";

// --- Sol (OpenClaw over SSH) -------------------------------------------
// Talks to Sol 5.5 (OpenClaw agent on 10.0.0.152) over an SSH key that's
// restricted to only the cc-agent wrapper — the dashboard can run an agent
// turn and nothing else. The user's message is passed as SSH_ORIGINAL_COMMAND
// and parsed back out of OpenClaw's --json output (result.payloads[].text).
const OPENCLAW_HOST = process.env.OPENCLAW_SSH_HOST || "10.0.0.152";
const OPENCLAW_KEY = process.env.OPENCLAW_SSH_KEY || "/root/.ssh/openclaw_agent";

const TIMEOUT_MS = 120000;
const MAX_BUFFER = 1024 * 1024;

/** Reply text plus the numeric usage meta from the same --json payload. */
interface SolResult {
  text: string;
  usage: Partial<UsageTurn>;
}

function runSol(message: string): Promise<SolResult> {
  return new Promise((resolve, reject) => {
    execFile(
      "ssh",
      [
        "-i", OPENCLAW_KEY,
        "-o", "StrictHostKeyChecking=accept-new",
        "-o", "ConnectTimeout=10",
        `root@${OPENCLAW_HOST}`,
        message
      ],
      { timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER },
      (err, stdout) => {
        if (err) return reject(err);
        try {
          const parsed = JSON.parse(stdout);
          // EVERY payload, in order, joined — never payloads[0] alone and never
          // split on sentences. Only the ends are trimmed, never mid-content.
          //
          // NOTE: short one-word answers here are NOT a parser fault. The
          // cc-agent forced command on 152 is `cc-agent $SSH_ORIGINAL_COMMAND`,
          // which the remote shell word-splits; if that wrapper forwards only
          // $1, Sol is asked just the first word and genuinely replies to it.
          // Verified: "In two sentences, what is ZFS?" arrives as "In".
          const payloads = Array.isArray(parsed?.result?.payloads) ? parsed.result.payloads : [];
          const text = payloads
            .map((p: { text?: string }) => (typeof p?.text === "string" ? p.text : ""))
            .filter(Boolean)
            .join("\n")
            .trim();
          // Same payload, no extra call and no change to the transport — just
          // reading the numeric meta that was already coming back.
          resolve({ text: text || "(no reply)", usage: extractSolUsage(parsed) });
        } catch {
          reject(new Error("Could not parse agent output"));
        }
      }
    );
  });
}

// --- Claude (headless CLI) ----------------------------------------------
// Verified working as the builder user, including under a minimal environment
// with no HOME — the CLI resolves the credential store from the passwd entry,
// which is what the systemd unit (User=builder, no HOME set) provides.
const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";

function runClaude(message: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      CLAUDE_BIN,
      // execFile does not use a shell, so the message is never interpreted by
      // one. The `--` guard additionally stops a message that starts with "-"
      // from being read as a CLI flag.
      ["-p", "--", message],
      { timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER },
      (err, stdout) => {
        if (err) return reject(err);
        resolve(stdout.trim() || "(no reply)");
      }
    );
  });
}

const FAILURE_MESSAGE: Record<AssistantBackend, string> = {
  sol: "◇ Link to OpenClaw unavailable. Check gateway URL / token.",
  claude: "◇ Claude backend unavailable. Check the claude CLI login on this box."
};

export async function POST(req: Request) {
  const { messages, backend } = await req.json();
  // Claude is the default: it's the backend verified working on this box.
  const chosen: AssistantBackend = backend === "sol" ? "sol" : "claude";

  // Only the latest user message is sent — OpenClaw keeps its own session
  // history under the command-central session id, so we don't resend it all.
  const last = [...messages].reverse().find((m: { role: string }) => m.role === "user");
  if (!last) return NextResponse.json({ reply: "", backend: chosen });

  const startedAt = Date.now();
  try {
    // Give whichever backend is active a compact live view of the dashboard, so
    // it can answer about containers/esports/its own stats instead of declining.
    // A failing source degrades to "unavailable" inside the snapshot; it never
    // blocks the turn.
    // ONE bounded esports lookup per turn: decide what (if anything) to fetch,
    // fetch it, and attach the result so the model answers from real data.
    // Keyword parse first (free); only an esports-shaped question that it can't
    // classify pays for a cheap JSON pre-pass through the active backend.
    let intent = parseIntent(last.content);
    if (intent.kind === "none" && looksLikeEsports(last.content)) {
      try {
        const probe =
          chosen === "sol"
            ? (await runSol(PREPASS_PROMPT(last.content))).text
            : await runClaude(PREPASS_PROMPT(last.content));
        intent = parsePrepass(probe);
      } catch {
        /* pre-pass is best-effort; fall through with no lookup */
      }
    }
    const lookup = await performLookup(intent).catch(() => null);
    if (lookup) {
      console.log(`chat lookup: ${intent.kind}("${intent.query}") via ${intent.via} -> found=${lookup.found}`);
    }

    const base = await withContext(last.content).catch(() => last.content);
    const prompt = lookup
      ? [
          base,
          "",
          `[ESPORTS LOOKUP — live vlr-api result for this question]`,
          lookup.text,
          "[END LOOKUP]",
          lookup.found
            ? "Answer using this lookup data."
            : "The lookup found nothing — say so plainly; do not invent a result."
        ].join("\n")
      : base;

    let reply: string;
    let usage: Partial<UsageTurn> = {};

    if (chosen === "sol") {
      const result = await runSol(prompt);
      reply = result.text;
      usage = result.usage;
    } else {
      reply = await runClaude(prompt);
      // The Claude CLI reports no token meta; latency is still worth recording.
      usage = { durationMs: Date.now() - startedAt, model: "claude-code", provider: "anthropic" };
    }

    // Fire-and-forget: usage logging must never delay or break a reply.
    void recordTurn({
      ts: Date.now(),
      backend: chosen,
      ok: true,
      durationMs: usage.durationMs ?? Date.now() - startedAt,
      model: usage.model ?? null,
      provider: usage.provider ?? null,
      sessionId: usage.sessionId ?? null,
      inputTokens: usage.inputTokens ?? null,
      outputTokens: usage.outputTokens ?? null,
      totalTokens: usage.totalTokens ?? null,
      contextTokens: usage.contextTokens ?? null,
      cacheRead: usage.cacheRead ?? null,
      cacheWrite: usage.cacheWrite ?? null,
      promptTokens: usage.promptTokens ?? null
    });

    return NextResponse.json({ reply, backend: chosen });
  } catch (err) {
    console.error(`agent call failed (${chosen}):`, err instanceof Error ? err.message : err);
    void recordTurn({
      ts: Date.now(), backend: chosen, ok: false,
      durationMs: Date.now() - startedAt,
      model: null, provider: null, sessionId: null,
      inputTokens: null, outputTokens: null, totalTokens: null,
      contextTokens: null, cacheRead: null, cacheWrite: null, promptTokens: null
    });
    return NextResponse.json({ reply: FAILURE_MESSAGE[chosen], backend: chosen });
  }
}
