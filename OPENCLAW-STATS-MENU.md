# OpenClaw / Sol — Stats Discovery Findings

Reconnaissance only, 2026-08-19. Nothing built, no keys widened, no config changed.
Probing was read-only from LXC 220 against `10.0.0.152:18789` using the gateway
token already in `.env.local`.

## Headline

**There is no REST stats API.** The gateway exposes exactly two HTTP data
endpoints; everything else is a Single Page App shell. All real data moves over
a **WebSocket RPC** protocol.

## What is reachable RIGHT NOW from the dashboard box

| Source | Auth | Returns |
|---|---|---|
| `GET /health` | none | `{"ok":true,"status":"live"}` — liveness only |
| `GET /control-ui-config.json` | `Authorization: Bearer <token>` | assistant identity + server version |

`/control-ui-config.json` real shape (token redacted, nothing secret in it):

```json
{ "assistantName": "MewBot", "assistantAvatar": "🐁", "assistantAgentId": "main",
  "serverVersion": "2026.7.1-2", "embedSandbox": "scripts",
  "terminalEnabled": false, "allowExternalEmbedUrls": false,
  "localMediaPreviewRoots": ["/tmp/openclaw", "/root/.openclaw/media", "/root/.openclaw/canvas"] }
```

Any other path (`/status`, `/metrics`, `/usage`, …) returns the **same 14406-byte
SPA shell** — easy to mistake for a live endpoint. Paths under `/api/*` return a
genuine `text/plain` 404, so that namespace is routed but empty.

## The WebSocket data plane

`ws://10.0.0.152:18789/` — protocol confirmed live and reverse-engineered from
the server's own validation errors:

1. On connect the server pushes
   `{"type":"event","event":"connect.challenge","payload":{"nonce":"…","ts":…}}`
2. The client replies with a request frame:

```json
{ "type": "req", "id": "1", "method": "connect",
  "params": { "minProtocol": 4, "maxProtocol": 4,
              "client": { "id": "cli", "version": "1.0.0", "platform": "web", "mode": "webchat" },
              "auth": { "token": "<gateway token>" } } }
```

Request frames are `{type:"req", id, method, params}`; responses are
`{type:"res", id, ok, error?}`; server pushes are `{type:"event", event, payload}`.

**Blocker (deliberate, not a bug):** with a valid schema the server replies

```
CONTROL_UI_ORIGIN_NOT_ALLOWED — "origin not allowed (open the Control UI from the
gateway host or allow it in gateway.controlUi.allowedOrigins)"
```

This is an origin allowlist. I did **not** forge an `Origin` header to get past
it — that is a security control and the decision to relax it is the operator's.
To use this path the dashboard origin would need adding to
`gateway.controlUi.allowedOrigins` on LXC 152.

### RPC methods confirmed to exist (from the shipped client bundles)

`node.list` · `device.pair.list` · `device.pair.approve` · `device.pair.reject` ·
`device.token.rotate` · `device.token.revoke` · `exec.approvals.get` ·
`exec.approvals.set` · `exec.approvals.node.get` · `exec.approvals.node.set`

Auth scopes: `operator.read`, `operator.write`, `operator.admin`,
`operator.approvals`, `operator.pairing` — `operator.read` is all a stats page needs.

This is a partial list: the Control UI lazy-loads per-page chunks that were not
in the preload manifest, so more methods certainly exist behind
`sessions`/`usage`/`logs`.

## What OpenClaw tracks (from the UI route map + shipped labels)

Routes: `overview` `activity` `agents` `channels` `sessions` `usage` `instances`
`nodes` `tasks` `cron` `logs` `skills` `skills/workshop` `mcp` `workboard`
`worktrees` `dreaming` `debug` `plugin` + settings pages.

Label mining confirms these carry real metrics:

- **sessions** — session keys, per-session model + provider, **token counts and
  token deltas** (`"{before} to {after} tokens"`), pinned/archived/forked state,
  activity recency filters
- **instances** — "Presence beacons from the gateway and clients", last-input
  time, disconnect reason, hosts/IPs (behind a visibility toggle)
- **channels** — "Channel status snapshots from the gateway", channel health
- **agents** — configured agents, ids, which is default
- **cron** — schedules (hourly/daily/weekly/one-shot) and next runs
- **workboard** — task pipeline counts: Triage, Backlog, Todo, Scheduled, Ready,
  Running, Review, Blocked, Done
- **dreaming** — on/off state, scene, diary
- **worktrees** — managed repo checkouts owned by OpenClaw

## THE MENU

### (A) System / config stats — available now, no Sol needed

| Stat | Source | Detail |
|---|---|---|
| Gateway liveness | `GET /health` | up/down, trivially pollable |
| Server version (`2026.7.1-2`) | `/control-ui-config.json` | exact build |
| Assistant identity (MewBot, 🐁, agent `main`) | `/control-ui-config.json` | name/avatar/agent id |
| Feature flags (terminal, embed sandbox, external embeds) | `/control-ui-config.json` | booleans |
| Media roots configured | `/control-ui-config.json` | paths (mildly sensitive) |

That is genuinely all that's reachable today without either relaxing the origin
allowlist or widening the SSH wrapper. **A stats page built only on (A) would be
thin** — a version string, a health dot and an avatar.

### (B) Live agent / usage stats — need Sol answering (quota returns Saturday)

Already proven to arrive in `openclaw agent --json` per turn:
`runId` · `status` · `durationMs` · `provider` · `model` · `sessionId` ·
`contextTokens` · `usage{input,output,total}` ·
`lastCallUsage{input,output,cacheRead,cacheWrite,total}` · `promptTokens`

This is the richest per-turn material and needs **no new access** — the existing
`cc-agent` wrapper already returns it. A stats page could accumulate these
client-side per turn (same rolling-history trick the homelab graphs use):
tokens per turn, cache hit ratio, latency distribution, context growth.

### (C) History / audit stats — need CLI access on LXC 152

Not reachable with the current key (restricted to the one wrapper). These need
either you running them, or a second scoped wrapper:

```
openclaw --version
openclaw status
openclaw agents list --json
openclaw channels list --json
openclaw sessions list --json
openclaw usage --json
openclaw audit list --json --limit 50
openclaw commitments list --json
openclaw capability list --json
openclaw config get --json
openclaw cron list --json
openclaw tasks list --json
```

(Exact subcommand spelling unverified — run each with `--help` first; note which
support `--json`.)

## SENSITIVE — exclude from any stats page

- **Gateway token / password** — the Overview page has "Show token"; never render
- **Session and chat message content** — surface counts and token totals, never bodies
- **Hosts and IPs of connected instances** — the UI gates these behind a toggle
- **Device pairing tokens** (`device.token.*`) — pairing state only, never tokens
- **Dreaming "Diary"** — likely private introspection text
- **`localMediaPreviewRoots`** — filesystem paths, low value on a dashboard

## Three viable routes to a rich page

1. **Per-turn meta only (B)** — zero new access, works Saturday, genuinely rich.
2. **Relax the origin allowlist** — add the dashboard origin to
   `gateway.controlUi.allowedOrigins`, then use the WebSocket RPC server-side.
   Unlocks sessions/usage/nodes/instances live.
3. **Second scoped SSH wrapper** — e.g. `cc-stats` locked to a fixed allowlist of
   read-only `openclaw … --json` commands. Unlocks (C) without widening the
   existing agent key.

Recommendation: (1) + (3). (1) is free and immediate; (3) is a small, auditable
addition that keeps the agent key untouched.
