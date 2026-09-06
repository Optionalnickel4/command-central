/** Common response shape every /api/widgets/* route returns.
 *  Keeping this consistent means a new widget's API route is a copy-paste
 *  of an existing one with the fetch logic swapped out. */
export interface WidgetResponse<T> {
  status: "ok" | "degraded" | "error";
  updatedAt: string;
  staleAt?: string;
  maxAgeMs?: number;
  /** Stable sanitized diagnostic code, never raw upstream output. */
  reasonCode?: string;
  data: T;
  /** True when `data` is hardcoded placeholder, not a live source. Absent on
   *  real routes, so a consumer (including the assistant snapshot) can tell
   *  sample numbers from real ones. */
  mock?: boolean;
}
