import { describe, expect, it } from "vitest";
import {
  BAD_UPSTREAM, INTERNAL_ERROR, NOT_PRESENT, OK, UPSTREAM_UNAVAILABLE,
  aggregateStatus, esportsGate, widgetStatus
} from "@/lib/response-status";

/**
 * The status-code decision, which is the whole point of the change: a consumer
 * must be able to tell success from failure by the status line alone, WITHOUT
 * losing graceful degradation.
 *
 * The regression these guard against is turning per-service degradation into a
 * whole-request 5xx — one dead service among six healthy ones is the design
 * working, not a failed request.
 */

const up = { ok: true };
const down = { ok: false };
const six = (downCount: number) => [
  ...Array.from({ length: downCount }, () => down),
  ...Array.from({ length: 6 - downCount }, () => up)
];

describe("aggregateStatus — a fan-out over independent upstreams", () => {
  it("is 200 when every service answered", () => {
    expect(aggregateStatus(six(0))).toBe(OK);
  });

  it("is 200 with ONE service down — that is degradation, not failure", () => {
    // The media page's contract, and the thing most at risk in this change:
    // five live slices plus one marked unavailable still renders a page.
    expect(aggregateStatus(six(1))).toBe(OK);
  });

  it("stays 200 all the way down to a single surviving service", () => {
    for (let downCount = 1; downCount <= 5; downCount++) {
      expect(aggregateStatus(six(downCount))).toBe(OK);
    }
  });

  it("is 503 only when every service failed — nothing left to degrade to", () => {
    expect(aggregateStatus(six(6))).toBe(UPSTREAM_UNAVAILABLE);
  });

  it("does not care about ordering or which service is the survivor", () => {
    expect(aggregateStatus([down, down, up, down])).toBe(OK);
    expect(aggregateStatus([up, down, down, down])).toBe(OK);
    expect(aggregateStatus([down, down, down, up])).toBe(OK);
  });

  it("treats an empty fan-out as success — nothing was asked for, nothing failed", () => {
    expect(aggregateStatus([])).toBe(OK);
  });

  it("is 200 for a lone healthy service and 503 for a lone dead one", () => {
    expect(aggregateStatus([up])).toBe(OK);
    expect(aggregateStatus([down])).toBe(UPSTREAM_UNAVAILABLE);
  });
});

describe("widgetStatus — a single-source route", () => {
  it("is 200 when the route reports ok", () => {
    expect(widgetStatus("ok")).toBe(OK);
  });

  it("is 503 when the route's one upstream produced nothing", () => {
    expect(widgetStatus("error")).toBe(UPSTREAM_UNAVAILABLE);
  });
});

describe("the codes themselves", () => {
  it("distinguishes an unavailable upstream, a bad upstream reply, and our own fault", () => {
    expect(UPSTREAM_UNAVAILABLE).toBe(503);
    expect(BAD_UPSTREAM).toBe(502);
    expect(INTERNAL_ERROR).toBe(500);
    expect(OK).toBe(200);
  });
});

describe("esportsGate — config-absent vs a real outage", () => {
  /**
   * The distinction this gate exists for: "no VLR_API_URL" and "VLR_API_URL is
   * set but the host is down" must not read alike to a consumer. Only the
   * second one is a 503.
   */
  it("does not answer 503 when VLR_API_URL is unset — nothing is broken", () => {
    const gate = esportsGate(true, false);
    expect(gate.ready).toBe(false);
    expect(gate).not.toMatchObject({ status: UPSTREAM_UNAVAILABLE });
    expect(gate).toMatchObject({ status: NOT_PRESENT, error: "esports not configured" });
  });

  it("treats an unset URL the same way as the disabled flag: not part of this instance", () => {
    const disabled = esportsGate(false, true);
    const unconfigured = esportsGate(true, false);

    expect(disabled).toMatchObject({ ready: false, status: NOT_PRESENT });
    expect(unconfigured).toMatchObject({ ready: false, status: NOT_PRESENT });
    // Same status, distinguishable body — a cloner can tell which one they hit.
    expect(disabled).toMatchObject({ error: "esports disabled" });
    expect(unconfigured).toMatchObject({ error: "esports not configured" });
  });

  it("keeps the disabled path at 404, unchanged, whatever the URL says", () => {
    expect(esportsGate(false, false)).toMatchObject({ ready: false, status: NOT_PRESENT });
    expect(esportsGate(false, true)).toMatchObject({ ready: false, status: NOT_PRESENT });
  });

  it("lets a configured instance through, so only a FAILED call decides 503", () => {
    expect(esportsGate(true, true)).toEqual({ ready: true });
    // Past the gate, an unreachable-but-configured vlr-api is the outage case,
    // and that is still a 503.
    expect(widgetStatus("error")).toBe(UPSTREAM_UNAVAILABLE);
    expect(widgetStatus("ok")).toBe(OK);
  });

  it("never returns a 5xx for any gate outcome — the gate is pre-flight, not failure", () => {
    for (const [enabled, configured] of [[false, false], [false, true], [true, false]]) {
      const gate = esportsGate(enabled, configured) as { ready: false; status: number };
      expect(gate.status).toBeLessThan(500);
    }
  });
});
