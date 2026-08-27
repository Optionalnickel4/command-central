/**
 * Request-shape validation for POST /api/chat.
 *
 * Lives here rather than inline in the route so it is a pure function of the
 * parsed body — no Request, no NextResponse — and can be unit-tested directly.
 * The route keeps ownership of the HTTP response; this only answers "is this
 * body acceptable, and what did it actually ask for".
 */

/** The two assistant backends. Mirrors the route's public union. */
export type AssistantBackend = "sol" | "claude";

export interface ChatMessage {
  role: string;
  content: string;
}

export interface ValidChatRequest {
  messages: ChatMessage[];
  /** Resolved, never undefined: Claude is the default backend on this box. */
  backend: AssistantBackend;
}

/**
 * Ceiling on total input. Generous for real chat, but stops a garbage
 * megabyte from reaching a backend that shells out.
 */
export const MAX_INPUT_CHARS = 10000;

/**
 * Validate a parsed request body.
 *
 * Returns the normalised request, or null when the body is unusable — the
 * caller turns null into a terse 400 that never echoes the offending input.
 */
export function validateChatBody(body: unknown): ValidChatRequest | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const { messages, backend } = body as { messages?: unknown; backend?: unknown };

  // messages must be a non-empty array of { role: string, content: string }.
  if (!Array.isArray(messages) || messages.length === 0) return null;
  for (const m of messages) {
    if (typeof m !== "object" || m === null) return null;
    const { role, content } = m as { role?: unknown; content?: unknown };
    if (typeof role !== "string" || typeof content !== "string") return null;
  }
  const msgs = messages as ChatMessage[];

  // backend is optional; when present it must be exactly one of the two names.
  // An arbitrary string is rejected rather than silently defaulted through.
  if (backend !== undefined && backend !== "sol" && backend !== "claude") return null;

  // Cap total input size before doing anything with it.
  if (msgs.reduce((n, m) => n + m.content.length, 0) > MAX_INPUT_CHARS) return null;

  return { messages: msgs, backend: backend === "sol" ? "sol" : "claude" };
}
