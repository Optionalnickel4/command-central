import { describe, expect, it } from "vitest";
import { MAX_INPUT_CHARS, validateChatBody } from "@/lib/chat-request";

/**
 * The guard on POST /api/chat. This is the one surface in the app that shells
 * out, so every rejection below is the difference between a 400 and a malformed
 * value reaching execFile.
 */
describe("validateChatBody", () => {
  it("accepts a minimal well-formed body and defaults the backend to claude", () => {
    const result = validateChatBody({ messages: [{ role: "user", content: "hi" }] });
    expect(result).not.toBeNull();
    expect(result!.backend).toBe("claude");
    expect(result!.messages).toHaveLength(1);
  });

  it("keeps an explicitly requested backend", () => {
    expect(validateChatBody({ messages: [{ role: "user", content: "hi" }], backend: "sol" })!.backend)
      .toBe("sol");
    expect(validateChatBody({ messages: [{ role: "user", content: "hi" }], backend: "claude" })!.backend)
      .toBe("claude");
  });

  it("rejects a body that is not an object", () => {
    for (const body of [null, undefined, "messages", 42, true, [{ role: "user", content: "hi" }]]) {
      expect(validateChatBody(body)).toBeNull();
    }
  });

  it("rejects a missing, empty, or non-array messages field", () => {
    expect(validateChatBody({})).toBeNull();
    expect(validateChatBody({ messages: [] })).toBeNull();
    expect(validateChatBody({ messages: "hi" })).toBeNull();
    expect(validateChatBody({ messages: { role: "user", content: "hi" } })).toBeNull();
  });

  it("rejects a message whose role or content is not a string", () => {
    expect(validateChatBody({ messages: [{ role: "user" }] })).toBeNull();
    expect(validateChatBody({ messages: [{ content: "hi" }] })).toBeNull();
    expect(validateChatBody({ messages: [{ role: 1, content: "hi" }] })).toBeNull();
    expect(validateChatBody({ messages: [{ role: "user", content: { text: "hi" } }] })).toBeNull();
    expect(validateChatBody({ messages: [null] })).toBeNull();
    // One bad message among good ones still fails the whole body.
    expect(validateChatBody({
      messages: [{ role: "user", content: "ok" }, { role: "user", content: 5 }]
    })).toBeNull();
  });

  it("rejects a backend that is not one of the two known names", () => {
    for (const backend of ["gpt", "", "SOL", 1, null]) {
      expect(validateChatBody({ messages: [{ role: "user", content: "hi" }], backend })).toBeNull();
    }
  });

  it("rejects input over the total-character ceiling, counted across messages", () => {
    const half = "x".repeat(MAX_INPUT_CHARS / 2);
    // Exactly at the cap is allowed; one character past it is not.
    expect(validateChatBody({
      messages: [{ role: "user", content: half }, { role: "user", content: half }]
    })).not.toBeNull();
    expect(validateChatBody({
      messages: [{ role: "user", content: half }, { role: "user", content: `${half}x` }]
    })).toBeNull();
  });
});
