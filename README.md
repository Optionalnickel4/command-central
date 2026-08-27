# Command Central

A self-hosted JARVIS-style dashboard for a homelab. It brings live Proxmox status, an AI assistant with voice, OpenClaw agent stats, read-only media services, and Valorant esports into one HUD.

Built with Next.js 14 (App Router), TypeScript, and Tailwind. There is no database: each panel polls its own server-side API route and fails independently when its backend is unavailable.

> **Personal infrastructure, not a drop-in product.** This repo is tailored to one homelab and has no authentication. Run it on a trusted LAN or tailnet; do not expose it directly to the internet.

## What works

- **Homelab** — Proxmox cluster and guest detail
- **Assistant** — SOL (OpenClaw over restricted SSH) and CLAUDE (local Claude Code CLI)
- **Voice** — Piper TTS proxy with orb visualization
- **Sol stats** — OpenClaw status, sessions, audit, capabilities, and usage
- **Media** — read-only Jellyfin, Sonarr, Radarr, Prowlarr, qBittorrent, and Jellyseerr
- **Esports** — scoreboard, standings, stats, ticker, and player radar via [vlr-api](https://github.com/Optionalnickel4/vlr-api)

Weather, calendar, and news cards are currently mock data. Their environment variables are placeholders and are not read by the app yet.

Every integration is optional. Missing credentials produce an unavailable card instead of taking down the dashboard.

## Quick start

Requirements: Node.js 18.17+ (22 recommended) and npm.

```bash
git clone https://github.com/Optionalnickel4/command-central
cd command-central
npm install
cp .env.example .env.local
npm run dev
```

Open <http://localhost:3000>. An empty `.env.local` is a valid first run: the shell renders, while unconfigured integrations report unavailable.

For production:

```bash
npm run build
npm start
```

A rebuild is required for changes to appear under `next start`.

## Configuration

Copy `.env.example`; only the variables below are currently read.

### Proxmox

All three are required for the homelab panel:

```dotenv
PROXMOX_API_URL=https://your-proxmox-host:8006
PROXMOX_TOKEN_ID=user@pam!readonly-token
PROXMOX_TOKEN_SECRET=...
```

Use a read-only token. The client intentionally uses Node's `https` module to support a self-signed Proxmox certificate.

### Assistant, Sol, and voice

```dotenv
CLAUDE_BIN=claude
OPENCLAW_SSH_HOST=10.0.0.152
OPENCLAW_SSH_KEY=/path/to/openclaw_agent
OPENCLAW_STATS_KEY=/path/to/openclaw_stats
PROJECTS_SSH_KEY=/path/to/cc_projects
PROJECTS_TTL_MS=600000
PIPER_URL=http://127.0.0.1:5303
```

- The Claude backend reuses the service user's existing Claude Code login; it does not read an API key.
- The Sol backend reaches OpenClaw through a forced-command SSH key.
- Keep the forced commands and separate keys if reproducing this setup. The wrappers restrict agent turns, stats, and project reads independently.

### Esports

```dotenv
VLR_API_URL=http://your-vlr-api:8000
ENABLE_ESPORTS=false
```

The API is a separate self-hosted service. Without it, esports routes return unavailable.

`ENABLE_ESPORTS` defaults to on when unset. Set it to `false` if you do not run vlr-api: the esports panels, the `/esports/player/[id]` route and the command-bar entry are removed, and nothing in the app calls vlr-api — including the assistant's context snapshot and its esports lookups. The dashboard page is prerendered, so run `npm run build` after changing the flag — a restart alone keeps the old value.

### Media

Configure any subset; each service is independent.

| Service | Variables |
| --- | --- |
| Jellyfin | `JELLYFIN_URL`, `JELLYFIN_API_KEY` |
| Sonarr | `SONARR_URL`, `SONARR_API_KEY` |
| Radarr | `RADARR_URL`, `RADARR_API_KEY` |
| Prowlarr | `PROWLARR_URL`, `PROWLARR_API_KEY` |
| qBittorrent | `QBITTORRENT_URL`, `QBITTORRENT_USER`, `QBITTORRENT_PASS` |
| Jellyseerr / Overseerr | `SEERR_URL`, `SEERR_API_KEY` |

### Runtime

```dotenv
PORT=3000
```

The app also uses `PORT` when assembling assistant context from its own routes.

## Architecture

```
app/
  page.tsx                         dashboard
  sol/page.tsx                     OpenClaw stats
  media/page.tsx                   media overview
  esports/player/[id]/             player radar
  api/chat/route.ts                 SOL / CLAUDE assistant
  api/tts/route.ts                  Piper proxy
  api/media/route.ts                combined media payload
  api/sol/*                         stats endpoints
  api/widgets/<name>/route.ts       live widget endpoints
components/
  dashboard-shell.tsx               HUD layout
  assistant-panel.tsx               chat console
  sol-orb.tsx                       orb / audio visualizer
  widgets/registry.ts               widget placement
lib/
  pve.ts                            Proxmox client
  vlr.ts                            vlr-api client
  media.ts                          media clients
  sol.ts / projects.ts              restricted SSH links
  fetcher.ts                        widget polling hook
```

Widget routes must export:

```ts
export const dynamic = "force-dynamic";
```

Without it, Next.js can prerender a route and freeze a live panel at build time.

To add a widget:

1. Add `app/api/widgets/<name>/route.ts` returning `WidgetResponse<T>`.
2. Add a client component using `useWidgetData()`.
3. Register it in `components/widgets/registry.ts`.

## Development notes

- `npm run build` is the release check (types and lint).
- Runtime usage is written to gitignored `data/usage.jsonl`.
- Animations respect `prefers-reduced-motion`.
- Fonts are self-hosted through `@fontsource`; keep them that way to avoid build-time Google Fonts requests.
- `docs/` contains the original feature briefs and implementation notes.

## License

No license specified.
