import { NextResponse } from "next/server";

/**
 * Text-to-speech proxy for the local Piper service.
 *
 * The browser never talks to Piper directly — same pattern as every other
 * data source here. Piper is bound to 127.0.0.1 and only this route reaches it.
 *
 * Failure is always soft: the console treats any non-200 as "no voice today"
 * and still shows the text reply.
 */
export const dynamic = "force-dynamic";

const PIPER_URL = process.env.PIPER_URL || "http://127.0.0.1:5303";
// Per-REQUEST safety cap, not a narration limit. The client now chunks the
// whole reply into ~280-char sentences and queues them, so each call here is
// one short chunk; this ceiling only guards against an oversized single
// request keeping Piper busy. Replies are no longer truncated.
const MAX_CHARS = 500;
const TIMEOUT_MS = 60000;

export async function POST(req: Request) {
  let text = "";
  try {
    const body = await req.json();
    text = String(body?.text ?? "").trim();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  if (!text) return NextResponse.json({ error: "empty text" }, { status: 400 });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${PIPER_URL}/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, MAX_CHARS) }),
      signal: controller.signal,
      cache: "no-store"
    });

    if (!res.ok) throw new Error(`piper responded ${res.status}`);

    const audio = await res.arrayBuffer();
    return new NextResponse(audio, {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(audio.byteLength),
        "Cache-Control": "no-store"
      }
    });
  } catch (err) {
    console.error("tts failed:", err instanceof Error ? err.message : err);
    // 503 is the client's cue to go quiet, not to show an error to the user.
    return NextResponse.json({ error: "voice unavailable" }, { status: 503 });
  } finally {
    clearTimeout(timer);
  }
}
