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
/**
 * The feature is not part of this instance — switched off, or never configured.
 * Not a failure, so deliberately not a 5xx.
 */
export const NOT_PRESENT = 404;
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

/**
 * The pre-flight gate every esports route runs before it touches vlr-api.
 *
 * Three outcomes, and the middle one is the point of this helper: "no
 * VLR_API_URL" and "VLR_API_URL is set but the host is down" are DIFFERENT
 * situations and must not read alike to a consumer.
 *
 *   flag off        → 404. Not part of this instance.
 *   URL unset       → 404. Config absent — a clone mid-setup with esports left
 *                     on but no vlr-api pointed at yet. Nothing is broken, so a
 *                     503 ("this was supposed to work and didn't") would lie.
 *   configured      → ready: go and fetch. Only a FAILED call is a 503, and
 *                     that is decided later, by widgetStatus.
 *
 * Pure, and takes the two booleans rather than reading env itself, so the
 * routes keep using the existing esportsEnabled() / hasVlrConfig() helpers —
 * the checks stay in one place each and this only decides what they mean.
 */
export type EsportsGate =
  | { ready: false; status: number; error: string }
  | { ready: true };

export function esportsGate(enabled: boolean, configured: boolean): EsportsGate {
  if (!enabled) return { ready: false, status: NOT_PRESENT, error: "esports disabled" };
  if (!configured) return { ready: false, status: NOT_PRESENT, error: "esports not configured" };
  return { ready: true };
}

/**
 * The config-state code for a plain single-source panel (weather, news,
 * calendar) whose only configuration is env vars — the same distinction
 * esportsGate draws, for features that have no enable flag to weigh.
 *
 * "Never configured" and "configured but the upstream is down" are different
 * situations, and only the second is a 503. A panel that was never pointed at
 * anything isn't broken, it's waiting to be set up: 404, so the widget renders
 * a calm "configure me" state instead of an alarm.
 *
 * Pure, and takes the boolean rather than reading env itself, so each feature
 * keeps its own has*Config() helper as the single place that knows the vars.
 */
export function configStatus(configured: boolean): number {
  return configured ? OK : NOT_PRESENT;
}
