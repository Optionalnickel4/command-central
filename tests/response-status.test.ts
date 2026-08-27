import { describe, expect, it } from "vitest";
import {
  BAD_UPSTREAM, INTERNAL_ERROR, OK, UPSTREAM_UNAVAILABLE, aggregateStatus, widgetStatus
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
