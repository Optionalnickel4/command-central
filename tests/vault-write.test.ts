import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, writeFile, rm, mkdir, symlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  MAX_BULLET_TEXT,
  detectDurableFact,
  formatBullet,
  parseLogRequest,
  sanitizeBulletText
} from "@/lib/vault-write";

/**
 * Write-back. Three parties append to these files — this app, OpenClaw on 152,
 * and the human in Obsidian — so the tests that matter most are the ones
 * pinning the append-only invariant and the one-line invariant. A bullet that
 * can carry a newline can forge a second bullet; a write that rewrites the file
 * can eat somebody else's edit.
 */

const PROJECTS = ["_index", "command-central", "homelab", "mrvl-api", "openclaw", "vlr-api"];

describe("sanitizeBulletText — one bounded line, always", () => {
  it("collapses newlines so a second bullet cannot be forged", () => {
    const out = sanitizeBulletText("a real note\n- [2020-01-01] forged bullet");
    expect(out).not.toContain("\n");
    expect(out).toBe("a real note - [2020-01-01] forged bullet");
  });

  it("collapses carriage returns, tabs and control characters too", () => {
    const out = sanitizeBulletText("a\r\nb\tc\u0000d\u007fe");
    expect(out).toBe("a b c d e");
    expect(/[\u0000-\u001f\u007f]/.test(out)).toBe(false);
  });

  it("strips a leading bullet marker so the result is never '- [date] - x'", () => {
    expect(sanitizeBulletText("- already a bullet")).toBe("already a bullet");
    expect(sanitizeBulletText("* star bullet")).toBe("star bullet");
  });

  it("caps overlong text on a word boundary", () => {
    const out = sanitizeBulletText("word ".repeat(400));
    expect(out.length).toBeLessThanOrEqual(MAX_BULLET_TEXT + 1);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/wor…$/);
  });

  it("hard-cuts a single unbroken token rather than deleting it", () => {
    // A 2000-character token has no space to cut back to; trimming the partial
    // word would leave nothing of it at all.
    const out = sanitizeBulletText(`LONGTEST ${"x".repeat(2000)}`);
    expect(out.length).toBeGreaterThan(MAX_BULLET_TEXT * 0.9);
    expect(out).toMatch(/^LONGTEST x{100,}…$/);
  });

  it("returns empty for whitespace-only input", () => {
    expect(sanitizeBulletText("   \n\t ")).toBe("");
    expect(sanitizeBulletText("")).toBe("");
  });
});

describe("formatBullet — the dated-bullet convention", () => {
  it("is `- [YYYY-MM-DD] text` on one line", () => {
    const line = formatBullet("migrated to the new host", new Date(2026, 7, 29));
    expect(line).toBe("- [2026-08-29] migrated to the new host");
    expect(line.split("\n")).toHaveLength(1);
  });

  it("uses the local date, zero-padded", () => {
    expect(formatBullet("x", new Date(2026, 0, 5))).toBe("- [2026-01-05] x");
  });

  it("stays one line even when handed a multi-line payload", () => {
    expect(formatBullet("a\nb\nc", new Date(2026, 7, 29)).split("\n")).toHaveLength(1);
  });
});

describe("parseLogRequest — the explicit path", () => {
  it("reads the colon form", () => {
    expect(parseLogRequest("log to vlr-api: migrated to the new host", PROJECTS)).toMatchObject({
      project: "vlr-api",
      text: "migrated to the new host",
      via: "explicit"
    });
  });

  it("reads the 'that' form", () => {
    expect(parseLogRequest("add a note to command-central that the vault is wired up", PROJECTS))
      .toMatchObject({ project: "command-central", text: "the vault is wired up" });
  });

  it("accepts assorted phrasings and a .md suffix", () => {
    for (const msg of [
      "please log to mrvl-api: ratings deferred",
      "append an entry to mrvl-api saying ratings deferred",
      "note to mrvl-api: ratings deferred",
      "record this in mrvl-api.md: ratings deferred"
    ]) {
      expect(parseLogRequest(msg, PROJECTS), msg).toMatchObject({ project: "mrvl-api" });
    }
  });

  it("resolves the project case-insensitively", () => {
    expect(parseLogRequest("log to VLR-API: x", PROJECTS)).toMatchObject({ project: "vlr-api" });
  });

  it("does NOT fire for an unknown project — it falls through to chat", () => {
    expect(parseLogRequest("log to not-a-project: x", PROJECTS)).toBeNull();
    expect(parseLogRequest("log to vlr-ap: typo", PROJECTS)).toBeNull();
  });

  it("does not fire on ordinary conversation", () => {
    for (const msg of [
      "what's the status of vlr-api?",
      "can you add a widget to the dashboard",
      "the logs on vlr-api look fine",
      "log in to vlr-api"
    ]) {
      expect(parseLogRequest(msg, PROJECTS), msg).toBeNull();
    }
  });

  it("carries a newline-injecting request through the sanitizer", () => {
    const p = parseLogRequest("log to vlr-api: real\n- [2020-01-01] forged", PROJECTS);
    expect(p!.text).not.toContain("\n");
    expect(p!.line.split("\n")).toHaveLength(1);
  });
});

describe("detectDurableFact — the offered path, deliberately shy", () => {
  it("offers on a stated change naming one project", () => {
    expect(detectDurableFact("vlr-api moved to 10.0.0.21 today", PROJECTS)).toMatchObject({
      project: "vlr-api",
      via: "offered"
    });
  });

  it("stays silent on questions", () => {
    expect(detectDurableFact("did vlr-api move to 10.0.0.21?", PROJECTS)).toBeNull();
    expect(detectDurableFact("where was vlr-api deployed", PROJECTS)).toBeNull();
  });

  it("stays silent without a change verb", () => {
    expect(detectDurableFact("vlr-api is looking healthy today", PROJECTS)).toBeNull();
  });

  it("stays silent when no known project is named", () => {
    expect(detectDurableFact("the printer moved to the other room", PROJECTS)).toBeNull();
  });

  it("stays silent when two projects are named — which file is ambiguous", () => {
    expect(detectDurableFact("vlr-api and mrvl-api both migrated hosts", PROJECTS)).toBeNull();
  });

  it("does not match a project name inside another word", () => {
    expect(detectDurableFact("the homelabbing setup moved racks", PROJECTS)).toBeNull();
  });

  it("defers to the explicit path rather than proposing twice", () => {
    expect(detectDurableFact("log to vlr-api: we migrated the host", PROJECTS)).toBeNull();
  });

  it("ignores the index note as a target", () => {
    expect(detectDurableFact("_index moved somewhere", PROJECTS)).toBeNull();
  });
});

// --- The filesystem half ---------------------------------------------------

describe("appendBullet — append-only, against a real directory", () => {
  let dir: string;
  let vault: typeof import("@/lib/vault");

  const NOTE = [
    "# VLR API",
    "",
    "A scraper API.",
    "",
    "## Open items / TODO",
    "",
    "- Add the real screenshots.",
    ""
  ].join("\n");

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vault-test-"));
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "vlr-api.md"), NOTE, "utf8");
    vi.resetModules();
    vi.stubEnv("VAULT_DIR", dir);
    vault = await import("@/lib/vault");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.resetModules();
    await rm(dir, { recursive: true, force: true });
  });

  const read = () => readFile(join(dir, "vlr-api.md"), "utf8");

  it("appends one dated bullet under a ## Log section it creates", async () => {
    const res = await vault.appendBullet("vlr-api", "migrated to the new host");
    expect(res.ok).toBe(true);

    const after = await read();
    expect(after.startsWith(NOTE)).toBe(true); // every original byte, in place
    expect(after).toContain("## Log");
    expect(after).toContain(res.line!);
    expect(after.trimEnd().endsWith(res.line!)).toBe(true);
  });

  it("does not file log entries under Open items / TODO", async () => {
    await vault.appendBullet("vlr-api", "a log entry");
    const after = await read();
    const todo = after.indexOf("## Open items / TODO");
    const log = after.indexOf("## Log");
    expect(log).toBeGreaterThan(todo);
    // The bullet sits after the Log heading, not in the TODO list.
    expect(after.indexOf("a log entry")).toBeGreaterThan(log);
  });

  it("reuses the Log section on the second write and keeps the first bullet", async () => {
    const a = await vault.appendBullet("vlr-api", "first entry");
    const b = await vault.appendBullet("vlr-api", "second entry");
    const after = await read();

    expect(after.match(/^## Log$/gm)).toHaveLength(1);
    expect(after).toContain(a.line!);
    expect(after).toContain(b.line!);
    expect(after.indexOf(b.line!)).toBeGreaterThan(after.indexOf(a.line!));
    expect(after.startsWith(NOTE)).toBe(true);
  });

  it("preserves a line another writer appended in between", async () => {
    // The three-writer case: OpenClaw or Obsidian writes while we are idle.
    const a = await vault.appendBullet("vlr-api", "jarvis one");
    await writeFile(join(dir, "vlr-api.md"), "- [2026-08-29] from another writer\n", {
      flag: "a"
    });
    const b = await vault.appendBullet("vlr-api", "jarvis two");

    const after = await read();
    expect(after).toContain(a.line!);
    expect(after).toContain("from another writer");
    expect(after).toContain(b.line!);
    expect(after.startsWith(NOTE)).toBe(true);
  });

  it("adds a newline first when the file does not end in one", async () => {
    await writeFile(join(dir, "vlr-api.md"), "# Note\nno trailing newline", "utf8");
    const res = await vault.appendBullet("vlr-api", "appended");
    const after = await read();
    expect(after).toContain("no trailing newline\n");
    expect(after).toContain(res.line!);
    expect(after.split("\n").filter((l) => l.includes("no trailing newline"))).toHaveLength(1);
  });

  it("writes exactly one line per call", async () => {
    const before = (await read()).split("\n").length;
    await vault.appendBullet("vlr-api", "one\ntwo\nthree");
    const lines = (await read()).split("\n");
    // The bullet itself is one line; the Log heading block is the rest.
    expect(lines.filter((l) => l.startsWith("- [")).length).toBe(1);
    expect(lines.length).toBeGreaterThan(before);
  });

  it("rejects a traversal name and writes nothing", async () => {
    for (const name of ["../../etc/passwd", "/etc/passwd", "foo/bar", "..", ""]) {
      const res = await vault.appendBullet(name, "should never land");
      expect(res.ok, name).toBe(false);
      expect(res.error).toBe("invalid project name");
    }
    expect(await read()).toBe(NOTE);
  });

  it("rejects a well-formed name with no file rather than creating one", async () => {
    const res = await vault.appendBullet("not-a-real-note", "x");
    expect(res.ok).toBe(false);
    expect(res.error).toBe("no such project note");
  });

  it("neither reads nor appends through a project-note symlink", async () => {
    const target = join(dir, "outside.txt");
    await writeFile(target, "must remain untouched", "utf8");
    await symlink(target, join(dir, "trap.md"));

    vault.clearVaultCache();
    expect(await vault.readProject("trap")).toBeNull();
    const res = await vault.appendBullet("trap", "escaped write");
    expect(res).toEqual({ ok: false, error: "not a project note" });
    expect(await readFile(target, "utf8")).toBe("must remain untouched");
  });

  it("rejects empty text", async () => {
    const res = await vault.appendBullet("vlr-api", "   \n  ");
    expect(res.ok).toBe(false);
    expect(res.error).toBe("empty bullet text");
    expect(await read()).toBe(NOTE);
  });

  it("returns a clean error when the vault directory is gone", async () => {
    await rm(dir, { recursive: true, force: true });
    const res = await vault.appendBullet("vlr-api", "x");
    expect(res.ok).toBe(false);
    expect(res.error).toBe("no such project note");
  });

  it("makes the new bullet visible to readers immediately", async () => {
    await vault.readProject("vlr-api"); // warm the cache
    const res = await vault.appendBullet("vlr-api", "freshly appended");
    const content = await vault.readProject("vlr-api");
    expect(content).toContain(res.line!);
  });
});
