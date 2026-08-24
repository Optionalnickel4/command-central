# Command Central

A self-hosted "Jarvis" dashboard for a homelab — a single HUD-styled cockpit
showing live Proxmox status, an AI assistant console with voice, an OpenClaw
agent-stats page, a read-only media-stack overview, and Valorant esports
panels.

Next.js 14 (App Router) + TypeScript + Tailwind. No database: every panel
polls its own API route, so there is no state to migrate or go stale.

---

## Read this first

**This was built for one specific homelab, and it is published as a
reference, not as a drop-in product.** It talks to a particular Proxmox node,
a particular OpenClaw agent over SSH, and a particular media stack. Nothing
here auto-discovers your infrastructure.

You can absolutely run it — the setup below is honest and complete — but
expect to adapt rather than deploy. Concretely:

- **It has no authentication and is designed to have none.** It is meant to
  sit on a LAN or tailnet. Do not put it on the public internet.
- **Panels degrade individually.** Anything you can't or don't configure
  renders an "unavailable" card; the rest of the dashboard carries on. You can
  start with nothing configured and still see the whole layout.
- **The esports section needs a companion service** you also self-host. See below.

### The esports panels need a companion service

The esports scoreboard, standings, news, stats and player-radar pages all read
from **vlr-api** — a self-hosted Valorant (VLR.gg) REST API. It is a separate
project, not bundled in this repo, but it is open source and self-hostable
like everything else here:

> **https://github.com/Optionalnickel4/vlr-api**

Clone and run it, then point `VLR_API_URL` at it. Until you do, the esports
panels degrade cleanly to unavailable — the app does not crash or hang — and
the rest of the dashboard is unaffected. Making the section toggleable, so you
can hide those panels rather than look at unconfigured ones, is planned but
not implemented; today they are always registered.

---

## What you need

| | |
|---|---|
| **Node.js** | 18.17+ (what Next.js 14 requires); developed on 22. The repo pins no `engines` field. |
| **npm** | Ships with Node. |
| **Network access at build time** | Fonts are self-hosted via `@fontsource`, so the build does **not** call `fonts.googleapis.com`. Normal npm registry access is enough. |

Everything else is optional and per-feature — see the table below.

---

## Features, and what each one actually requires

| Feature | Needs | If absent |
|---|---|---|
| **HUD shell** — boot sequence, orbit clusters, ticker, command bar | nothing | Always works |
| **Homelab panel** (`/`) | Proxmox API URL + read-only token | Panel shows `PROXMOX LINK DOWN — check credentials`; ticker/pulse go idle |
| **Assistant — Claude backend** | `claude` CLI installed and logged in on the host | Toggle returns a "backend unavailable" line |
| **Assistant — Sol backend** | An OpenClaw host reachable over a restricted SSH key | Toggle returns the remote error; Claude backend unaffected |
| **Voice** | A local Piper TTS HTTP service | Replies still render as text; only speech is lost |
| **Sol stats page** (`/sol`) | The OpenClaw stats SSH key | Panels show "Link offline" |
| **Media page** (`/media`) | Any subset of Jellyfin / Sonarr / Radarr / Prowlarr / qBittorrent / Jellyseerr | Each unconfigured service shows one "unavailable" card |
| **Esports** (`/`, `/esports/player/[id]`) | [vlr-api](https://github.com/Optionalnickel4/vlr-api) — a separate service you self-host | Panels show as unavailable until `VLR_API_URL` is set |
| **Weather / Calendar / News** | nothing — **these are hardcoded mock data today** | N/A |

**Weather, calendar and news are not wired up.** Each route returns a fixed
sample payload with a `TODO` comment describing the intended integration
(open-meteo, Google Calendar, a news API). Their environment variables exist
in `.env.example` but **no code reads them**. They are placeholders, and this
README would rather say so than let you spend an afternoon wondering why your
API key changes nothing.

---

## Setup

```bash
git clone <this repo>
cd command-central
npm install
cp .env.example .env.local     # fill in whatever you actually have
npm run dev
```

Open <http://localhost:3000>. With an empty `.env.local` you get the full
cockpit: every live panel reports unavailable, and the weather/calendar/news
panels show their sample data. That is the expected first run, and a good way
to confirm the UI works before wiring anything up.

Fill in `.env.local` incrementally; each variable you add lights up its own
panel on the next poll. There is no config validation step and no build-time
requirement for any of it.

### Production

The service runs `next start`, not `next dev`. **A change is not live until
you rebuild:**

```bash
npm run build
npm start                       # or restart your service unit
```

The author runs it as a systemd unit on a Debian LXC. There is no unit file in
this repo, but the shape is ordinary — a `WorkingDirectory` at the checkout, a
non-root `User=`, `ExecStart=/usr/bin/npm start`, `Environment=NODE_ENV=production
PORT=3000`, and `Restart=on-failure`. If you use the Sol backend, the service
user must be the one that owns the SSH keys.

---

## Environment variables

Every variable the code reads, with the file that reads it. Anything not in
this list has no effect. Copy `.env.example` — it carries the same information
inline.

### Proxmox — the homelab panel

Read by `lib/pve.ts`. All three are required together; `hasPveCredentials()`
checks for all three before any request is made.

| Variable | Required? | Notes |
|---|---|---|
| `PROXMOX_API_URL` | for homelab | e.g. `https://10.0.0.45:8006` |
| `PROXMOX_TOKEN_ID` | for homelab | e.g. `user@pam!tokenname` |
| `PROXMOX_TOKEN_SECRET` | for homelab | Use a **read-only PVEAuditor** token |

The Proxmox client deliberately uses Node's `https` module rather than
`fetch`, because undici ignores the per-request self-signed-cert bypass. TLS
verification is relaxed for these calls only, never globally. Don't
"modernize" it to `fetch` — the panel goes dark.

### Sol / OpenClaw assistant backend

| Variable | Default | Read by |
|---|---|---|
| `OPENCLAW_SSH_HOST` | `10.0.0.152` | `app/api/chat/route.ts`, `lib/sol.ts`, `lib/projects.ts` |
| `OPENCLAW_SSH_KEY` | `/home/builder/.ssh/openclaw_agent` | `app/api/chat/route.ts` — chat turns |
| `OPENCLAW_STATS_KEY` | `/home/builder/.ssh/openclaw_stats` | `lib/sol.ts` — the `/sol` page |
| `PROJECTS_SSH_KEY` | `/home/builder/.ssh/cc_projects` | `lib/projects.ts` — project-status context |
| `PROJECTS_TTL_MS` | `600000` (10 min) | `lib/projects.ts` — project-status cache |

### Claude assistant backend

| Variable | Default | Notes |
|---|---|---|
| `CLAUDE_BIN` | `claude` | Path to the Claude Code CLI. Uses the host user's existing login — **no API key is read or sent by this app.** |

### Voice

| Variable | Default | Notes |
|---|---|---|
| `PIPER_URL` | `http://127.0.0.1:5303` | Local Piper TTS. The browser never talks to it directly; `app/api/tts/route.ts` proxies. Any non-200 is treated as "no voice today". |

### Esports

| Variable | Required? | Notes |
|---|---|---|
| `VLR_API_URL` | for esports | Base URL of your own [vlr-api](https://github.com/Optionalnickel4/vlr-api) instance — a separate self-hosted service, see above. Read by `lib/vlr.ts`; only server-side esports routes import it. |

### Media stack — all read-only, all independent

Read by `lib/media.ts`. Configure any subset.

| Service | Variables |
|---|---|
| Jellyfin | `JELLYFIN_URL`, `JELLYFIN_API_KEY` |
| Sonarr | `SONARR_URL`, `SONARR_API_KEY` |
| Radarr | `RADARR_URL`, `RADARR_API_KEY` |
| Prowlarr | `PROWLARR_URL`, `PROWLARR_API_KEY` |
| qBittorrent | `QBITTORRENT_URL`, `QBITTORRENT_USER`, `QBITTORRENT_PASS` |
| Jellyseerr / Overseerr | `SEERR_URL`, `SEERR_API_KEY` |

Each missing value produces a specific card — `"JELLYFIN_URL not set"` — so a
half-configured media page tells you exactly what it's missing.

### Runtime

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `3000` | Standard Next.js port. `lib/context-snapshot.ts` also uses it to call the app's own routes on `127.0.0.1` when assembling assistant context. |

### Present in `.env.example` but unread

`WEATHER_LAT`, `WEATHER_LON`, `GOOGLE_CALENDAR_CLIENT_ID`,
`GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REFRESH_TOKEN`,
`NEWS_API_KEY`, `NEWS_TOPICS`, `PROMETHEUS_URL`, `HOMELAB_MCP_URL`,
`HOMELAB_MCP_TOKEN`.

No code reads any of these. They are parked for the unfinished weather,
calendar and news routes, plus an earlier homelab data-source plan.

---

## The assistant

The console under the orb has a **SOL | CLAUDE** toggle. Both backends return
the same `{ reply }` shape, so the orb's idle → thinking → speaking lifecycle
is identical either way. `POST /api/chat` takes
`{ messages: [{ role, content }], backend }` and defaults to `claude`.

Before either backend runs, `lib/context-snapshot.ts` prepends a compact live
snapshot of the dashboard — container states, alerts, esports fixtures, agent
stats — so the assistant answers "is anything wrong?" from real numbers
instead of declining. Any source that fails degrades to "unavailable" inside
the snapshot and never blocks the turn.

### The Claude backend

Shells out to the Claude Code CLI (`claude -p -- <message>`) as the user the
service runs as, reusing that user's existing login. There is no API key in
this app. If `claude` isn't installed or logged in, this toggle reports the
backend as unavailable and the Sol toggle is unaffected.

### The Sol backend

SSHes to an OpenClaw agent host and parses `result.payloads[].text` out of
`openclaw agent --json`.

This is worth understanding before you copy it. There are **three separate SSH
keys**, and each one's `authorized_keys` entry on the far side uses a
`command=` forced command that restricts it to exactly one wrapper:

| Key | Wrapper | Can do |
|---|---|---|
| `openclaw_agent` | `cc-agent` | Run one agent turn |
| `openclaw_stats` | `cc-stats` | Four read-only stat commands |
| `cc_projects` | `cc-projects` | `cat` one `PROJECTS.md` |

Nothing user-supplied reaches the stats or projects wrappers — the app can
only send literal keywords, and each wrapper independently refuses anything
else. **If you reproduce this pattern, keep the forced commands.** An
unrestricted SSH key from a no-auth web app to an agent host is a very
different security posture than what is described here.

The wrappers themselves live on the agent host, not in this repo.

---

## Architecture

```
app/
  page.tsx                  → the cockpit (DashboardShell)
  sol/page.tsx              → OpenClaw agent stats
  media/page.tsx            → media stack overview (read-only)
  esports/player/[id]/      → player radar + detail
  layout.tsx                → self-hosted @fontsource fonts (no next/font/google)
  globals.css               → all HUD styling: grid, glow, scanlines, ticker
  api/
    chat/route.ts           → assistant (sol | claude backends)
    tts/route.ts            → Piper proxy
    media/route.ts          → one combined payload for all six media services
    sol/*                   → agent status/sessions/audit/capability/usage
    widgets/<name>/route.ts → one route per widget, shared WidgetResponse<T>
      homelab/              → LIGHT: one cluster/resources call, polled 15s
      homelab-detail/       → HEAVY: per-guest fan-out, server-cached ~12s
components/
  dashboard-shell.tsx       → header, orbit conduits, clusters, ticker
  sol-orb.tsx               → the centrepiece arc-reactor SVG core
  assistant-panel.tsx       → the chat console
  command-bar.tsx           → bottom console + "/" command input
  widgets/registry.ts       → THE list of widgets and where they orbit
lib/
  pve.ts                    → Proxmox client (Node https — see above)
  vlr.ts                    → vlr-api client (separate self-hosted service)
  media.ts                  → all six media-service clients
  sol.ts / projects.ts      → the restricted SSH links
  fetcher.ts                → useWidgetData() polling hook
```

Every widget API route must export `export const dynamic = "force-dynamic"`,
or Next prerenders it at build time and the "live" panel freezes on
build-time data.

### Adding a widget

1. `app/api/widgets/<name>/route.ts` returning `WidgetResponse<T>` (copy the
   weather route — it's the simplest) with `dynamic = "force-dynamic"`.
2. `components/widgets/<name>-widget.tsx`, a client component calling
   `useWidgetData<T>("/api/widgets/<name>")`.
3. One line in `components/widgets/registry.ts` choosing its `cluster`
   (`"left"` or `"right"`).

For a whole new section, use a new `section` string and add its display name
to `SECTION_TITLES` in the same file. The shell renders clusters, not
individual widgets, so nothing else changes.

---

## Development notes

- `npm run build` must pass — it runs types and lint.
- The runtime usage log is written to `data/usage.jsonl`, which is gitignored.
- Animations respect `prefers-reduced-motion`; keep that if you add more.
- Fonts are self-hosted on purpose. Don't switch to `next/font/google` — it
  needs network access at build time.

## Docs

The `docs/` folder holds the task briefs this dashboard was built from —
per-feature specs, build reports, and fix write-ups. They are a development
record rather than user documentation, but they explain why several things
are the way they are. `docs/MEDIA-STACK.md` and `docs/PLAYER-RADAR.md` are
the most useful if you want to see how a feature was scoped end to end.

## License

None specified.
