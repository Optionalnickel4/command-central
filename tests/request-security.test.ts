import { describe, expect, it } from "vitest";
import {
  ConcurrencyGate,
  RateLimiter,
  readJsonBody,
  validateJsonMutation
} from "@/lib/request-security";

const jsonRequest = (body: string, headers: Record<string, string> = {}) =>
  new Request("https://jarvis.example/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body
  });

describe("mutation request security", () => {
  it("rejects text/plain JSON, closing the simple-request CSRF path", () => {
    const req = new Request("https://jarvis.example/api/chat", {
      method: "POST",
      headers: { "content-type": "text/plain", origin: "https://attacker.example" },
      body: '{"messages":[]}'
    });
    expect(validateJsonMutation(req)?.status).toBe(415);
  });

  it("rejects a hostile origin and accepts the request origin", () => {
    expect(validateJsonMutation(jsonRequest("{}", { origin: "https://attacker.example" }))?.status).toBe(403);
    expect(validateJsonMutation(jsonRequest("{}", { origin: "https://jarvis.example" }))).toBeNull();
  });

  it("enforces the byte ceiling while streaming", async () => {
    const result = await readJsonBody(jsonRequest(JSON.stringify({ text: "x".repeat(50) })), 20);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(413);
  });

  it("parses valid bounded JSON", async () => {
    const result = await readJsonBody(jsonRequest('{"text":"ok"}'), 100);
    expect(result).toMatchObject({ ok: true, value: { text: "ok" } });
  });
});

describe("resource controls", () => {
  it("limits a key within a window and resets afterward", () => {
    const limiter = new RateLimiter(2, 1000);
    expect(limiter.allow("user", 0)).toBe(true);
    expect(limiter.allow("user", 1)).toBe(true);
    expect(limiter.allow("user", 2)).toBe(false);
    expect(limiter.allow("user", 1000)).toBe(true);
  });

  it("bounds concurrency and releases idempotently", () => {
    const gate = new ConcurrencyGate(1);
    const release = gate.tryAcquire();
    expect(release).not.toBeNull();
    expect(gate.tryAcquire()).toBeNull();
    release!();
    release!();
    expect(gate.tryAcquire()).not.toBeNull();
  });
});
