import type { WidgetResponse } from "@/components/widgets/types";

export type OperationalState =
  | "healthy"
  | "degraded"
  | "down"
  | "stale"
  | "not_configured"
  | "disabled";

export type OperationalSeverity = "none" | "info" | "warning" | "critical";
export type OperationalDomain = "systems" | "assistant" | "media" | "context" | "esports";

export interface OperationalSignal {
  id: string;
  domain: OperationalDomain;
  state: OperationalState;
  severity: OperationalSeverity;
  summary: string;
  detail: string;
  observedAt: string;
  staleAt: string | null;
  reasonCode: string | null;
  detailHref?: string;
}

export interface SignalInput {
  id: string;
  domain: OperationalDomain;
  summary: string;
  detail?: string;
  detailHref?: string;
  status?: WidgetResponse<unknown>["status"];
  updatedAt?: string;
  staleAt?: string;
  maxAgeMs?: number;
  reasonCode?: string;
  configured?: boolean;
  enabled?: boolean;
  now?: number;
}

const SAFE_CODE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export function sanitizeReasonCode(value: string | undefined): string | null {
  return value && SAFE_CODE.test(value) ? value : null;
}

export function staleBoundary(input: Pick<SignalInput, "updatedAt" | "staleAt" | "maxAgeMs">): number | null {
  if (input.staleAt) {
    const explicit = Date.parse(input.staleAt);
    if (Number.isFinite(explicit)) return explicit;
  }
  if (input.updatedAt && typeof input.maxAgeMs === "number" && input.maxAgeMs >= 0) {
    const observed = Date.parse(input.updatedAt);
    if (Number.isFinite(observed)) return observed + input.maxAgeMs;
  }
  return null;
}

export function severityFor(state: OperationalState): OperationalSeverity {
  if (state === "down") return "critical";
  if (state === "degraded" || state === "stale") return "warning";
  if (state === "not_configured" || state === "disabled") return "info";
  return "none";
}

/**
 * Normalize one source without exposing source-specific payloads to the shell.
 * Configuration state has precedence over transport state, then a total error,
 * then freshness, then partial degradation.
 */
export function normalizeSignal(input: SignalInput): OperationalSignal {
  const now = input.now ?? Date.now();
  const observedAt = Number.isFinite(Date.parse(input.updatedAt ?? ""))
    ? input.updatedAt!
    : new Date(now).toISOString();
  const boundary = staleBoundary({ ...input, updatedAt: observedAt });

  let state: OperationalState;
  if (input.enabled === false) state = "disabled";
  else if (input.configured === false) state = "not_configured";
  else if (input.status === "error") state = "down";
  else if (boundary !== null && now >= boundary) state = "stale";
  else if (input.status === "degraded") state = "degraded";
  else state = "healthy";

  return {
    id: input.id,
    domain: input.domain,
    state,
    severity: severityFor(state),
    summary: input.summary,
    detail: input.detail ?? defaultDetail(state),
    observedAt,
    staleAt: boundary === null ? null : new Date(boundary).toISOString(),
    reasonCode: sanitizeReasonCode(input.reasonCode),
    ...(input.detailHref ? { detailHref: input.detailHref } : {})
  };
}

function defaultDetail(state: OperationalState): string {
  switch (state) {
    case "healthy": return "Live data is current.";
    case "degraded": return "Some data is unavailable; healthy slices remain live.";
    case "down": return "The source did not return usable data.";
    case "stale": return "Showing the last known good result.";
    case "not_configured": return "This optional source is not configured.";
    case "disabled": return "This optional source is disabled.";
  }
}

/** Media-style aggregate: one failure degrades, every failure is down. */
export function normalizeAggregateSignal(
  input: Omit<SignalInput, "status"> & { slices: { ok: boolean }[] }
): OperationalSignal {
  const ok = input.slices.filter((slice) => slice.ok).length;
  const status = input.slices.length > 0 && ok === 0
    ? "error"
    : ok < input.slices.length
      ? "degraded"
      : "ok";
  return normalizeSignal({ ...input, status });
}

const STATE_ORDER: Record<OperationalState, number> = {
  down: 0,
  degraded: 1,
  stale: 2,
  not_configured: 3,
  disabled: 4,
  healthy: 5
};

export function sortSignals(signals: OperationalSignal[]): OperationalSignal[] {
  return [...signals].sort((a, b) =>
    STATE_ORDER[a.state] - STATE_ORDER[b.state] || Date.parse(a.observedAt) - Date.parse(b.observedAt)
  );
}

export function incidents(signals: OperationalSignal[]): OperationalSignal[] {
  return sortSignals(signals.filter((signal) =>
    signal.state === "down" || signal.state === "degraded" || signal.state === "stale"
  ));
}
