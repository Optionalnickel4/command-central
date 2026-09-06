import { describe, expect, it } from "vitest";
import {
  incidents,
  normalizeAggregateSignal,
  normalizeSignal,
  sanitizeReasonCode,
  sortSignals,
  staleBoundary
} from "@/lib/operational-health";

const now = Date.parse("2026-09-05T12:00:00.000Z");
const base = {
  id: "homelab",
  domain: "systems" as const,
  summary: "Homelab",
  updatedAt: "2026-09-05T11:59:30.000Z",
  maxAgeMs: 60_000,
  now
};

describe("normalizeSignal", () => {
  it("maps live success to healthy", () => {
    expect(normalizeSignal({ ...base, status: "ok" })).toMatchObject({ state: "healthy", severity: "none" });
  });

  it("makes the stale boundary inclusive", () => {
    expect(normalizeSignal({ ...base, status: "ok", now: Date.parse("2026-09-05T12:00:30.000Z") }).state).toBe("stale");
  });

  it("uses explicit staleAt before maxAgeMs", () => {
    const signal = normalizeSignal({ ...base, staleAt: "2026-09-05T12:05:00.000Z", status: "ok" });
    expect(signal.state).toBe("healthy");
    expect(signal.staleAt).toBe("2026-09-05T12:05:00.000Z");
  });

  it("gives total failure precedence over stale data", () => {
    expect(normalizeSignal({ ...base, status: "error", now: now + 120_000 }).state).toBe("down");
  });

  it("gives disabled and unconfigured states precedence over errors", () => {
    expect(normalizeSignal({ ...base, enabled: false, status: "error" }).state).toBe("disabled");
    expect(normalizeSignal({ ...base, configured: false, status: "error" }).state).toBe("not_configured");
  });

  it("does not turn optional config absence into an incident", () => {
    const signals = [normalizeSignal({ ...base, configured: false, status: "error" })];
    expect(incidents(signals)).toEqual([]);
  });

  it("sanitizes diagnostic codes", () => {
    expect(sanitizeReasonCode("upstream.timeout")).toBe("upstream.timeout");
    expect(sanitizeReasonCode("https://10.0.0.1/token=secret")).toBeNull();
  });
});

describe("aggregate normalization", () => {
  it("is degraded when one media slice fails", () => {
    const signal = normalizeAggregateSignal({ ...base, domain: "media", slices: [{ ok: true }, { ok: false }] });
    expect(signal.state).toBe("degraded");
  });

  it("is down when every media slice fails", () => {
    const signal = normalizeAggregateSignal({ ...base, domain: "media", slices: [{ ok: false }, { ok: false }] });
    expect(signal.state).toBe("down");
  });

  it("treats an empty aggregate as healthy", () => {
    expect(normalizeAggregateSignal({ ...base, slices: [] }).state).toBe("healthy");
  });
});

describe("ordering and freshness helpers", () => {
  it("orders down, degraded, stale, informational, then healthy", () => {
    const states = ["healthy", "disabled", "stale", "degraded", "down"] as const;
    const signals = states.map((state, index) => normalizeSignal({
      ...base,
      id: String(index),
      enabled: state === "disabled" ? false : true,
      status: state === "down" ? "error" : state === "degraded" ? "degraded" : "ok",
      now: state === "stale" ? now + 120_000 : now
    }));
    expect(sortSignals(signals).map((signal) => signal.state)).toEqual(states.toReversed());
  });

  it("returns null for invalid timestamps", () => {
    expect(staleBoundary({ updatedAt: "nope", maxAgeMs: 10 })).toBeNull();
  });
});
