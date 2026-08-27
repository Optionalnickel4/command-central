import { describe, expect, it } from "vitest";
import { parseJsonLines, stripPaths } from "@/lib/sol";

/**
 * The scrubbing applied to everything cc-stats returns from 152 before it is
 * served to the browser. Absolute filesystem paths leak the host's layout and
 * add nothing to a stats page; ids and keys identify without leaking.
 */
describe("stripPaths", () => {
  it("drops the path-bearing keys", () => {
    const out = stripPaths({
      sessionFile: "/root/.openclaw/sessions/abc.jsonl",
      path: "/root/.openclaw",
      paths: ["/a", "/b"],
      root: "/root",
      lockfilePath: "/run/lock",
      markerPath: "/run/marker",
      url: "http://127.0.0.1:8080"
    });

    expect(out).toEqual({});
  });

  it("keeps identifiers and every other field intact", () => {
    const input = {
      key: "command-central",
      sessionId: "sess_01",
      agentId: "sol",
      totalTokens: 1234,
      enabled: true,
      model: null,
      sessionFile: "/root/x.jsonl"
    };

    expect(stripPaths(input)).toEqual({
      key: "command-central",
      sessionId: "sess_01",
      agentId: "sol",
      totalTokens: 1234,
      enabled: true,
      model: null
    });
  });

  it("scrubs at every depth, including inside arrays", () => {
    const out = stripPaths({
      sessions: [
        { key: "a", sessionFile: "/root/a.jsonl", nested: { root: "/root", ok: 1 } },
        { key: "b", sessionFile: "/root/b.jsonl" }
      ]
    }) as any;

    expect(out.sessions.map((s: any) => s.key)).toEqual(["a", "b"]);
    expect(JSON.stringify(out)).not.toContain("/root");
    expect(out.sessions[0].nested).toEqual({ ok: 1 });
  });

  it("leaves values that merely look path-like but are not path KEYS", () => {
    // The scrub is by key, not by content: a description mentioning a path is
    // not silently rewritten, so nothing legible is lost by accident.
    const out = stripPaths({ description: "reads /etc/hosts", id: "fs.read" }) as any;

    expect(out.description).toBe("reads /etc/hosts");
    expect(out.id).toBe("fs.read");
  });

  it("passes primitives and null through unchanged", () => {
    expect(stripPaths(null)).toBeNull();
    expect(stripPaths("plain")).toBe("plain");
    expect(stripPaths(7)).toBe(7);
    expect(stripPaths([1, 2, 3])).toEqual([1, 2, 3]);
  });
});

/** `capability list` emits JSONL, not a JSON array. */
describe("parseJsonLines", () => {
  it("parses one object per line", () => {
    const rows = parseJsonLines<{ id: string }>('{"id":"a"}\n{"id":"b"}\n');
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("skips blank and unparseable lines instead of throwing", () => {
    const rows = parseJsonLines<{ id: string }>('{"id":"a"}\n\nnot json\n  \n{"id":"b"}');
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("returns an empty list for empty input", () => {
    expect(parseJsonLines("")).toEqual([]);
  });
});
