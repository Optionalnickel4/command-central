/**
 * Instance feature flags — one place that resolves them, the way lib/pve.ts
 * owns hasPveCredentials().
 *
 * These are SERVER-side reads: process.env is only populated on the server, so
 * anything that renders on the client (the command bar, registry consumers)
 * takes the resolved boolean as a prop rather than calling this in the browser.
 */

/** Explicit off switches. Anything else (including unset) means on. */
const OFF = new Set(["false", "0", "no", "off", ""]);

/**
 * Is the esports section part of this instance?
 *
 * Opt-OUT: unset means ON, so the owner (who runs vlr-api) needs no config.
 * A cloner without vlr-api sets ENABLE_ESPORTS=false and gets a dashboard with
 * no esports panels, no player route and no vlr-api calls at all.
 */
export function esportsEnabled(): boolean {
  const raw = process.env.ENABLE_ESPORTS;
  if (raw === undefined) return true;
  return !OFF.has(raw.trim().toLowerCase());
}
