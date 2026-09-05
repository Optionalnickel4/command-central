import type { ComponentType } from "react";

// Every dashboard section (today: "homelab", "general" — tomorrow maybe
// "esports", "sol") is just a string key. Adding a new section doesn't
// require touching the cockpit shell, only registry entries.
export type WidgetSection = "homelab" | "general" | string;

/** Which side of the core orb a widget orbits on. */
export type WidgetCluster = "left" | "right";

export interface WidgetDefinition {
  /** Unique, stable id — used as the React key and for future layout persistence. */
  id: string;
  /** Which section of the dashboard this renders in. */
  section: WidgetSection;
  /** Which cluster it orbits in. Defaults to "right" when omitted. */
  cluster?: WidgetCluster;
  /** The widget's own component — owns its data fetching and rendering. */
  component: ComponentType;
}

/** Common response shape every /api/widgets/* route returns.
 *  Keeping this consistent means a new widget's API route is a copy-paste
 *  of an existing one with the fetch logic swapped out. */
export interface WidgetResponse<T> {
  status: "ok" | "degraded" | "error";
  updatedAt: string;
  data: T;
  /** Freshness policy carried with the payload so every consumer applies the
   * same stale boundary. `staleAt` wins when both forms are present. */
  staleAt?: string;
  maxAgeMs?: number;
  /** Stable, sanitized diagnostic identifier. Never put raw upstream text,
   * hostnames, paths, or credentials in this field. */
  reasonCode?: string;
  /** True when `data` is hardcoded placeholder, not a live source. Absent on
   *  real routes, so a consumer (including the assistant snapshot) can tell
   *  sample numbers from real ones. */
  mock?: boolean;
}
