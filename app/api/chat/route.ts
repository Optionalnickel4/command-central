import { NextResponse } from "next/server";
import { execFile } from "child_process";

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

function runSol(message: string): Promise<string> {
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
          const text = parsed?.result?.payloads?.map((p: { text?: string }) => p.text).filter(Boolean).join("\n");
          resolve(text || "(no reply)");
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

  try {
    const reply = chosen === "sol" ? await runSol(last.content) : await runClaude(last.content);
    return NextResponse.json({ reply, backend: chosen });
  } catch (err) {
    console.error(`agent call failed (${chosen}):`, err instanceof Error ? err.message : err);
    return NextResponse.json({ reply: FAILURE_MESSAGE[chosen], backend: chosen });
  }
}
