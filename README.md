# Command central

A personal dashboard: live homelab status, general daily info (weather,
calendar, tech/gaming news), and a Claude-powered assistant panel. Built to
grow — new sections (game servers, media stack, etc.) plug into the same
pattern without touching the shell.

## Stack

Next.js 14 (App Router) + TypeScript + Tailwind. No database — every widget
reads live from its own API route on each poll, so there's no state to go
stale or migrate.

## Running it

```bash
npm install
cp .env.example .env.local   # fill in what you have; widgets fall back to
                              # mock data until their route is wired up
npm run dev
```

Open http://localhost:3000. Everything works out of the box on mock data —
you don't need any keys filled in to see the full layout.

Note: this project was scaffolded and type-checked in a sandbox without
access to fonts.googleapis.com, so `npm run build` couldn't fetch Oswald/
Inter/JetBrains Mono there — that's an environment restriction on my end,
not a bug. It'll build fine wherever normal internet access exists (your
Mew/Meowth boxes, CI, etc.). `npx tsc --noEmit` passed clean.

## How it's structured

```
app/
  page.tsx                 → renders DashboardShell, nothing else
  api/widgets/<name>/      → one route per widget, all returning the same
                              { status, updatedAt, data } shape
  api/chat/route.ts        → assistant panel backend (Claude API)
components/
  dashboard-shell.tsx      → header/clock + the two-column layout
  widget-grid.tsx          → renders whatever's registered for a section
  widgets/
    registry.ts            → THE list of what exists and where it goes
    types.ts                → shared WidgetDefinition / WidgetResponse types
    <name>-widget.tsx      → one file per widget, owns its own fetch + render
```

## Adding a widget later

This is the part built for "add more later":

1. Add `app/api/widgets/<name>/route.ts` returning `WidgetResponse<T>` —
   copy any existing route, swap the data.
2. Add `components/widgets/<name>-widget.tsx` — a client component that
   calls `useWidgetData<T>("/api/widgets/<name>")` and renders the result.
   Copy `weather-widget.tsx` as the simplest template.
3. Register it in `components/widgets/registry.ts` — one line, `{ id,
   section, colSpan, component }`.

That's it. No changes to the shell, the grid, or any other widget. A new
top-level section (e.g. `"game-servers"`) works the same way — just use a
new `section` string and add a `<WidgetGrid section="game-servers"
title="Game servers" />` in `dashboard-shell.tsx`.

## Wiring real data (currently all mock)

Each API route has a `TODO` comment with specifics. Summary:

- **Homelab** (`api/widgets/homelab`) — node CPU/RAM from the
  `prometheus-pve-exporter` already running on Meowth (LXC 104); service
  health either via the `homelab-mcp` tools behind MCPJungle
  (`mcp.jushosting.dev`) or each service's own health endpoint.
- **Weather** — [open-meteo.com](https://open-meteo.com), no API key
  needed, lat/lon already in `.env.example`.
- **Calendar** — Google Calendar API, needs OAuth client + refresh token.
- **News** — any news API, filtered to tech/gaming topics.

## Assistant panel

Routes through your new OpenClaw install's Gateway (`app/api/chat/route.ts`)
rather than calling Claude directly, so it inherits OpenClaw's provider
fallback (ChatGPT primary, Claude fallback) and whatever tools/skills that
agent already has — instead of being a second, separate integration.

To enable it:

1. In `openclaw.json`, set `gateway.http.endpoints.chatCompletions.enabled`
   to `true` (disabled by default) and restart the gateway.
2. Fill in `OPENCLAW_GATEWAY_URL` (`http://<host>:18789` by default) and
   `OPENCLAW_GATEWAY_TOKEN` in `.env.local`.

**Security note:** a Gateway bearer token is full operator access on that
OpenClaw instance, not scoped to "just chat" — treat it like any other
admin credential. Keep the gateway on LAN/tailnet only (it already is,
matching this dashboard's no-auth/LAN-only setup) and never expose
`OPENCLAW_GATEWAY_URL` publicly. The token stays server-side in this
route and is never sent to the browser.

Currently chat-only — same scope as before, just a different backend.
Since it's now OpenClaw doing the routing, opening it up to actions later
is a config change on OpenClaw's side (tool policy) more than a code
change here.

## Deploying

Matches your existing pattern: new Debian LXC on Meowth, `npm run build &&
npm start` (or a systemd unit), fronted by Caddy with a new matcher/handle
pair — no Cloudflare Tunnel needed since this is LAN-only.
