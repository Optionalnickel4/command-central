import { NextResponse } from "next/server";

export const JSON_LIMITS = {
  chat: 16 * 1024,
  tts: 2 * 1024,
  vault: 4 * 1024
} as const;

type ReadJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; response: NextResponse };

function error(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

function configuredOrigins(req: Request): Set<string> {
  const configured = process.env.APP_ALLOWED_ORIGINS
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (configured?.length) return new Set(configured);

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  return new Set(host ? [`${proto}://${host}`] : [new URL(req.url).origin]);
}

/**
 * Reject browser cross-site mutations and content types that avoid CORS
 * preflight. A malicious page can send text/plain cross-origin without a
 * preflight; accepting it and then calling req.json() is enough for CSRF.
 */
export function validateJsonMutation(req: Request): NextResponse | null {
  const type = req.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (type !== "application/json") return error(415, "application/json required");

  if (req.headers.get("sec-fetch-site") === "cross-site") {
    return error(403, "cross-site request rejected");
  }

  const origin = req.headers.get("origin");
  if (origin && !configuredOrigins(req).has(origin)) {
    return error(403, "origin rejected");
  }
  return null;
}

/** Parse JSON while enforcing a real streaming byte ceiling. */
export async function readJsonBody(req: Request, maxBytes: number): Promise<ReadJsonResult> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, response: error(413, "request body too large") };
  }

  if (!req.body) return { ok: false, response: error(400, "expected a JSON body") };

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { ok: false, response: error(413, "request body too large") };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, response: error(400, "could not read request body") };
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, response: error(400, "expected a JSON body") };
  }
}

interface RateEntry {
  startedAt: number;
  count: number;
}

/** Fixed-window in-memory limiter for this single-process self-hosted service. */
export class RateLimiter {
  private readonly entries = new Map<string, RateEntry>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 4096
  ) {}

  allow(key: string, now = Date.now()): boolean {
    const current = this.entries.get(key);
    if (!current || now - current.startedAt >= this.windowMs) {
      if (this.entries.size >= this.maxKeys) this.prune(now, true);
      this.entries.set(key, { startedAt: now, count: 1 });
      return true;
    }
    if (current.count >= this.limit) return false;
    current.count += 1;
    return true;
  }

  private prune(now: number, force: boolean): void {
    for (const [key, entry] of this.entries) {
      if (now - entry.startedAt >= this.windowMs || (force && this.entries.size >= this.maxKeys)) {
        this.entries.delete(key);
      }
      if (this.entries.size < this.maxKeys) break;
    }
  }
}

export class ConcurrencyGate {
  private active = 0;

  constructor(private readonly maximum: number) {}

  tryAcquire(): (() => void) | null {
    if (this.active >= this.maximum) return null;
    this.active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
    };
  }
}

export function requestIdentity(req: Request): string {
  return (
    req.headers.get("x-command-central-user") ??
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",", 1)[0].trim() ??
    "local"
  );
}

export function tooManyRequests(message = "too many requests"): NextResponse {
  return NextResponse.json({ error: message }, { status: 429, headers: { "retry-after": "60" } });
}
