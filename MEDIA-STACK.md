# MEDIA-STACK.md — Media page integration (READ-ONLY)

The `/media` page integrates the whole media stack into Command Central as a
read-only command-center view. Centerpiece: **Jellyfin now-playing / active
sessions**. Everything else (downloads, queue/upcoming, recently added,
requests, indexers, library totals) supports it.

Manga (Komga/HakuNeko) is **out of scope** — not integrated.

---

## Where the stack lives

- LXC **103** ("Meowth"), `10.0.0.180`, Debian, Podman-compose at `/opt/arr/`.
- `media.lan` resolves to `10.0.0.180` via Technitium DNS (`10.0.0.171`) — the
  name is preferred (survives an IP change). Confirmed resolving from LXC 220.
- Jellyfin runs on the same box, port 8096 (not a separate container).

## Confirmed inventory (probed from LXC 220 — this is the receipts)

All six services are **reachable** from LXC 220. Probed 2026-08-22.

| Service     | Base URL              | Probe result                         | Auth model                    | API family |
|-------------|-----------------------|--------------------------------------|-------------------------------|------------|
| Jellyfin    | http://media.lan:8096 | 200 — `JusFlix` / `10.11.11`         | `X-Emby-Token` header         | Emby/Jellyfin |
| Sonarr      | http://media.lan:8989 | 401 (reachable, needs key)           | `X-Api-Key` header            | `api/v3`   |
| Radarr      | http://media.lan:7878 | 401 (reachable, needs key)           | `X-Api-Key` header            | `api/v3`   |
| Prowlarr    | http://media.lan:9696 | 401 (reachable, needs key)           | `X-Api-Key` header            | `api/v1` (NOT v3) |
| qBittorrent | http://media.lan:8080 | 403 Forbidden (reachable, needs login)| cookie login (`SID`)         | `api/v2`   |
| Seerr       | http://media.lan:5055 | 200 — Jellyseerr `3.3.0`             | `X-Api-Key` header            | `api/v1`   |

Probe commands used (unauthenticated reachability):

```
curl http://media.lan:8096/System/Info/Public        # 200, public, no key
curl http://media.lan:8989/api/v3/system/status       # 401 -> reachable, key required
curl http://media.lan:7878/api/v3/system/status       # 401
curl http://media.lan:9696/api/v1/system/status       # 401
curl http://media.lan:8080/api/v2/app/version         # 403 -> reachable, login required
curl http://media.lan:5055/api/v1/status              # 200, public
```

### Endpoints used per service

- **Jellyfin** (`X-Emby-Token`):
  - `/System/Info/Public` — server name/version (also the reachability probe, no key)
  - `/Sessions` — now-playing / active streams (the centerpiece)
  - `/Items/Counts` — library totals (movies / series / episodes)
  - `/Items/Latest?Limit=8` — recently added
- **Sonarr / Radarr** (`X-Api-Key`, `api/v3`):
  - `/api/v3/queue?pageSize=20` — downloading/importing
  - `/api/v3/calendar?start=…&end=…` — upcoming episodes/movies (next 7 days)
- **Prowlarr** (`X-Api-Key`, `api/v1`):
  - `/api/v1/indexer` — indexer list, health, count
- **qBittorrent** (cookie login):
  - `POST /api/v2/auth/login` (form user/pass, `Referer` = base) → `SID` cookie
  - `/api/v2/torrents/info?limit=20` — active torrents
  - `/api/v2/transfer/info` — global up/down speeds
- **Seerr** (`X-Api-Key`):
  - `/api/v1/status` — version (public)
  - `/api/v1/request?take=10&sort=added` — recent + pending requests

Session shapes were coded against the documented Jellyfin/arr/qBittorrent/Overseerr
schemas; the exact live JSON for the authenticated endpoints is confirmed once
the keys below are populated.

### Live-confirmed shapes + fixes (after keys landed)

With all credentials populated, every service returned live data. Three
endpoint quirks were found and fixed against the real responses:

- **qBittorrent** issues its session cookie as `QBT_SID_<port>` (e.g.
  `QBT_SID_8080`) on this build, not the older `SID`. Login returns **204** with
  an empty body. `lib/media.ts` now captures whichever cookie name is sent.
- **Jellyfin** rejects the bare `/Items/Latest` ("Error processing request") —
  recently-added must be fetched under a user context. We now read `/Users`,
  take the first user, and call `/Users/{id}/Items/Latest?Limit=8`.
- **Jellyseerr** `/api/v1/request` returns `media.tmdbId` + `mediaType` but a
  null title. Titles are resolved per-request through the TMDB proxy
  (`/api/v1/{movie|tv}/{tmdbId}` → `.title`/`.name`), fetched in parallel.
  Its request-status enum also adds **5 = completed** beyond Overseerr's 1–4.

Verified live (2026-08-22): Jellyfin 0 sessions / library 4 movies · 13 series ·
939 episodes · recently-added populated; Sonarr & Radarr reachable, queues empty;
Prowlarr 2/2 indexers (The Pirate Bay, TorrentDay); qBittorrent 0 torrents,
global speeds read; Seerr 6 requests with real titles + statuses. Isolation
tested: pointing Sonarr at a dead port degraded only that panel to
"unreachable" while the other five stayed live.

---

## Secrets — `.env.local` (gitignored)

All base URLs and credentials are set in `.env.local` (gitignored) and all six
panels are live. Matching name-only placeholders live in `.env.example`. The
block below documents where each key comes from if it ever needs regenerating.

```
JELLYFIN_URL=http://media.lan:8096      # set
JELLYFIN_API_KEY=                       # NEEDED — Jellyfin Dashboard → API Keys → +
SONARR_URL=http://media.lan:8989        # set
SONARR_API_KEY=                         # NEEDED — Sonarr → Settings → General → API Key
RADARR_URL=http://media.lan:7878        # set
RADARR_API_KEY=                         # NEEDED — Radarr → Settings → General → API Key
PROWLARR_URL=http://media.lan:9696      # set
PROWLARR_API_KEY=                       # NEEDED — Prowlarr → Settings → General → API Key
QBITTORRENT_URL=http://media.lan:8080   # set
QBITTORRENT_USER=                       # NEEDED — qBittorrent WebUI username
QBITTORRENT_PASS=                       # NEEDED — qBittorrent WebUI password
SEERR_URL=http://media.lan:5055         # set
SEERR_API_KEY=                          # NEEDED — Jellyseerr → Settings → General → API Key
```

All API calls are **server-side only** (route handler `/api/media`). Keys never
reach the browser; qBittorrent's login + cookie is handled entirely server-side
and the cookie is cached in memory. No credential is echoed into any response or
log line.

---

## Files

```
lib/media.ts                    → six read-only clients + ServiceResult<T> +
                                   describe()/getJson() helpers, qBit cookie login,
                                   byte/clock formatters. No mutating calls exist.
app/api/media/route.ts          → ONE route, six services fanned out with
                                   Promise.all, each isolated (Promise settle):
                                   a down service returns {ok:false,error} and the
                                   other five still render. force-dynamic.
components/media/media-panels.tsx → client panels; per-service graceful "unavailable"
                                   card; centerpiece Now Playing first.
app/media/page.tsx              → HUD page shell, BootRelease included (direct
                                   load/refresh would render blank without it),
                                   client back-nav to /.
components/command-bar.tsx      → added a "Media →" quick-jump chip.
.env.example / .env.local       → media stack config block.
```

## Robustness

- Each service fetched independently with a 6s timeout. If one is
  down/unreachable/auth-fails, that panel shows "unavailable" with a safe reason
  and the other five render. One flaky service never blanks or hangs the page.
- qBittorrent's cookie auth is isolated: a 403 forces one re-login, then a fresh
  login next call if it still fails.
- Errors are translated to safe UI strings (`auth failed`, `unreachable`,
  `timed out`) — never raw transport errors or credentials.

## Constraints honored

- READ-ONLY: no pause/delete/manage/mutating calls anywhere.
- Did not touch the Proxmox `https` transport, the OpenClaw SSH key, sol routes,
  TTS, the orb, or chat/esports logic.
- Reuses the existing `useWidgetData` polling hook and HUD style system.
