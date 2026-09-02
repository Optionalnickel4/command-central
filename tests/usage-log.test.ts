import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

describe("usage log concurrency", () => {
  let dir: string | undefined;

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.resetModules();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("does not lose newer appends when compaction runs", async () => {
    dir = await mkdtemp(join(tmpdir(), "usage-log-test-"));
    vi.stubEnv("USAGE_DATA_DIR", dir);
    vi.resetModules();
    const { recordTurn, readTurns } = await import("@/lib/usage-log");

    const turns = Array.from({ length: 700 }, (_, ts) => ({
      ts,
      backend: "sol" as const,
      ok: true,
      durationMs: null,
      model: null,
      provider: null,
      sessionId: null,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      contextTokens: null,
      cacheRead: null,
      cacheWrite: null,
      promptTokens: null
    }));

    await Promise.all(turns.map((turn) => recordTurn(turn)));
    const saved = await readTurns(1000);

    expect(saved).toHaveLength(549);
    expect(saved.map((turn) => turn.ts)).toEqual(
      Array.from({ length: 549 }, (_, index) => index + 151)
    );
  });
});
