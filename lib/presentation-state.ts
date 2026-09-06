import type { OperationalState } from "./operational-health";

/** Presentation semantics are shared; no source-specific payload or old HUD markup. */
export const STATE_PRESENTATION: Record<OperationalState, { label: string; symbol: string }> = {
  healthy: { label: "Healthy", symbol: "✓" },
  degraded: { label: "Degraded", symbol: "△" },
  down: { label: "Down", symbol: "×" },
  stale: { label: "Stale", symbol: "◷" },
  not_configured: { label: "Not configured", symbol: "—" },
  disabled: { label: "Disabled", symbol: "○" }
};
