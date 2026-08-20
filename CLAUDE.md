# CLAUDE.md — Command Central

Personal "Jarvis" dashboard. Next.js 14 (App Router) + TypeScript + Tailwind,
running as a systemd service on this box. Read this fully before changing anything.

## Where this runs

- This container is LXC **220** (`command-central`, `10.0.0.22`), Debian 13.
- The app is served by the **`command-central`** systemd service on port 3000.
  - `systemctl restart command-central` to apply changes (after `npm run build`).
  - `journalctl -u command-central -n 50 --no-pager` for logs.
- LAN-only, no auth, not internet-facing. Do not add auth or expose it.

## Golden rules (don't break these)

1. **Never touch the Proxmox fetch mechanism in `app/api/widgets/homelab/route.ts`
   without care.** It uses Node's `https` module directly (NOT `fetch`/undici)
   specifically because undici ignores the self-signed-cert bypass and throws
   `UND_ERR_INVALID_ARG`. `fetch` + a dispatcher was tried and failed. If you
   "modernize" this to fetch, the homelab panel goes dark. Leave the https
   approach in place.
2. **Never loosen the SSH key that reaches OpenClaw.** The assistant panel talks
   to the Sol agent by SSHing to `10.0.0.152` with `/root/.ssh/openclaw_agent`.
   That key is restricted on the far side (authorized_keys `command=`) to ONLY
   run one wrapper. Don't try to widen it, add commands, or run arbitrary things
   over it. Don't copy the key anywhere.
3. **Secrets live in `.env.local` only.** Never hardcode the Proxmox token, and
   never print `.env.local` contents into a file that could be committed. It's
   gitignored — keep it that way.
4. **Always `npm run build` before restarting the service.** The service runs
   `next start` (production), not dev — an unbuilt change won't show.
5. After any change, verify: `npm run build` passes, then
   `curl -s localhost:3000/api/widgets/homelab | head -c 80` still returns
   `"status":"ok"` with real data. Don't leave the homelab panel broken.

## Architecture

```
app/
  page.tsx                → renders <DashboardShell/>
  layout.tsx              → self-hosted fonts (@fontsource), NO next/font/google
                            (that needs network at build; we avoid it)
  globals.css             → all the HUD styling (grid bg, glow, scanlines, ticker)
  api/
    chat/route.ts         → assistant: SSHes to Sol on 10.0.0.152, parses
                            result.payloads[].text from `openclaw agent --json`
    widgets/<name>/route.ts → one API route per widget, all return the shared
                            WidgetResponse<T> shape { status, updatedAt, data }
    widgets/homelab/       → LIGHT: one cluster/resources call, polled 15s
    widgets/homelab-detail/ → HEAVY: per-guest status/current + config and
                            node status, fanned out with Promise.all and
                            cached ~12s server-side. Polled 30s.
components/
  dashboard-shell.tsx     → the cockpit: header, orbit conduits, left/right
                            clusters framing the Sol core, ticker
  sol-orb.tsx             → THE CENTREPIECE: layered SVG arc-reactor core
  sol-state.tsx           → SolStateProvider + useSolState (idle/thinking/
                            speaking/error). Presentation state only.
  boot-sequence.tsx       → cinematic power-on overlay (skippable)
  parallax-root.tsx       → publishes --mx/--my for the depth effect
  system-pulse.tsx        → publishes --sys-load/--sys-heat/--sys-alert
  command-bar.tsx         → persistent bottom console: cluster summary,
                            quick-jump chips, "/" command input → Sol
  homelab-feed.tsx        → ONE shared poll of the light homelab route for
                            the chrome (ticker, pulse, command bar). Registry
                            widgets still fetch their own data.
  ticker.tsx              → scrolling live-vitals marquee
  widget-cluster.tsx      → renders one orbital cluster (left|right) from the
                            registry, grouped by section
  assistant-panel.tsx     → the Sol chat console, under the orb
  widgets/
    registry.ts           → THE list: {id, section, cluster, component} plus
                            SECTION_TITLES. How sections/widgets are added.
    types.ts              → WidgetDefinition + WidgetResponse<T>
    radial-gauge.tsx      → animated SVG dial (CPU/RAM)
    history-graph.tsx     → animated rolling line/area graph
    hud-bars.tsx          → animated bar graph
    <name>-widget.tsx     → one component per widget; uses useWidgetData()
lib/
  fetcher.ts              → useWidgetData<T>(url, intervalMs) polling hook
  history.ts              → useRollingHistory(value, stamp) client-side window
  pve.ts                  → THE Proxmox client (Node https, NOT fetch — rule 1).
                            Shared by both homelab routes.
  format.ts               → formatBytes / formatUptime / pctOf
```

## How to add a widget or section (the extension pattern)

1. Create `app/api/widgets/<name>/route.ts` returning `WidgetResponse<T>`
   (copy an existing route — weather is the simplest). It MUST include
   `export const dynamic = "force-dynamic"` or the panel freezes on
   build-time data.
2. Create `components/widgets/<name>-widget.tsx`, a client component calling
   `useWidgetData<T>("/api/widgets/<name>")`.
3. Register it in `components/widgets/registry.ts` — one line, choosing which
   `cluster` ("left" or "right") it orbits in.
4. For a whole new SECTION, use a new `section` string and add its display
   name to `SECTION_TITLES` in the same file.

Nothing else needs to change — the shell renders clusters, not individual
widgets, so `dashboard-shell.tsx` is untouched even for a new section. Keep
this pattern — don't hand-place widgets in the shell.

## Data sources & env (.env.local)

- **Proxmox (homelab)** — WORKING. `PROXMOX_API_URL=https://10.0.0.45:8006`,
  `PROXMOX_TOKEN_ID`, `PROXMOX_TOKEN_SECRET`. Read-only PVEAuditor token.
  Node is named `lab`. Endpoint used: `/api2/json/cluster/resources`.
- **Sol / OpenClaw (assistant)** — WORKING via SSH (see rule 2).
- **Weather** — currently MOCK. Use open-meteo (no key). Lat/lon in env
  (`WEATHER_LAT=39.9526`, `WEATHER_LON=-75.1652`, Philadelphia).
- **Calendar / News** — currently MOCK. Google Calendar + a news API, later.
- **vlr-api (esports)** — NEW, to be added. Self-hosted VLR.gg (Valorant esports)
  REST API, reachable by URL (the user will provide `VLR_API_URL`). Read from a
  new server-side route; never call it directly from client components.

## Style system (HUD / "Jarvis")

Everything lives in `globals.css`. Palette in `:root`: `--hud-cyan #22d3ee`,
`--hud-amber #fbbf24`, `--hud-red #f43f5e`, `--hud-green #34d399`,
bg `#030711`. Core classes: `.hud-panel` (glowing bordered panel with corner
brackets), `.hud-scan` (scanline overlay), `.hud-glow-text`, `.live-pulse`,
`.ticker-track`, `.hud-grid` (animated bg grid). Fonts are mono-forward
(JetBrains Mono) for the terminal feel. Respect `prefers-reduced-motion` —
existing animations already gate on it; keep that.

## Testing your work

- `npm run build` must pass (types + lint).
- The site must still serve 200 at `localhost:3000`.
- The homelab API must still return live data.
- The Sol chat must still work (send a test message).
Don't consider a change done until all four hold.

## Operational notes (added after Phase 1)
- To restart the service: `sudo systemctl restart command-central` — builder has
  scoped passwordless sudo for exactly this (and `status`). Use it after every
  build so changes go live.
- Widget API routes must have `export const dynamic = "force-dynamic"` or Next
  prerenders them at build time and the "live" panels freeze on build-time data.
