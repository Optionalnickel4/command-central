/**
 * How an API route turns "what actually happened" into an HTTP status code.
 *
 * The rule, one place so every route applies it the same way:
 *
 *   partial success → 200, with the dead parts marked unavailable in the body
 *   total failure   → 5xx
 *
 * The distinction matters because graceful degradation is a FEATURE here. The
 * media page fans out to six independent services and the dashboard renders
 * per-widget; one dead service among five healthy ones is the design working,
 * not a failed request, and must stay 200 so the other five still render.
 * A 5xx is only honest when the whole response is a failure — every service in
 * an aggregate down, or a single-source widget whose one upstream is gone.
 *
 * Pure functions of already-collected results: no Request, no NextResponse, so
 * the decision is unit-testable on its own.
 */

/** Everything needed to reach a verdict: did this slice come back or not. */
export interface SliceResult {
  ok: boolean;
}

export const OK = 200;
/** An upstream this route depends on is unreachable, unconfigured, or errored. */
export const UPSTREAM_UNAVAILABLE = 503;
/** An upstream answered, but with an error rather than a usable result. */
export const BAD_UPSTREAM = 502;
/** The failure is ours, not an upstream's — a local read or a bug. */
export const INTERNAL_ERROR = 500;

/**
 * Status for a fan-out response assembled from several independent upstreams.
 *
 * 200 while ANY slice came back — that is the degraded-but-useful case the
 * per-slice `ok`/`error` markers exist for. 503 only when every slice failed,
 * i.e. there is no response left to degrade to.
 *
 * An empty list is 200: nothing was asked for, so nothing failed.
 */
export function aggregateStatus(results: SliceResult[]): number {
  if (results.length === 0) return OK;
  return results.some((r) => r.ok) ? OK : UPSTREAM_UNAVAILABLE;
}

/**
 * Status for a single-source route that reports through WidgetResponse's
 * `status` field. "error" there means its one upstream produced nothing, so the
 * whole response is a failure.
 *
 * `mock: true` payloads are NOT failures — a placeholder that says so honestly
 * is a successful response, and those routes report status "ok" already.
 */
export function widgetStatus(status: "ok" | "error"): number {
  return status === "ok" ? OK : UPSTREAM_UNAVAILABLE;
}
