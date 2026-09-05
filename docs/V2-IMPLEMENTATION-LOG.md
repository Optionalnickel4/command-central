# Command Central v2 implementation log

## Task 0 — reproducible baseline

Collected 2026-09-05 UTC on LXC 220 as the repository owner (`builder`).

### Repository and runtime

- Branch: `JARVIS-V2`
- Base commit: `daefc8d22f1a28f446f10f9a128c5a2547acb67f`
- Initial worktree: clean after preserving unrelated VLR assistant work as
  `b0ed4fd` on the pushed `jarvis-vlr-lookup-improvements` branch.
- Node.js: `v22.23.2`
- npm: `10.9.8`
- Next.js: `16.3.4`
- Production service: active on port 3000 before and after collection; no
  production restart or configuration change was performed.

The brief records 17 test files / 311 tests. The clean audited commit contains
16 files / 291 tests. The additional file and 20 tests were part of the
pre-existing uncommitted VLR work above, which explains the count difference.

### Baseline verification

- `npm test`: pass — 16 files, 291 tests.
- `npm run lint`: pass.
- `npm run build`: pass.
- Production service remained active and unchanged.

### Browser baseline

Screenshots are stored under `docs/screenshots/`:

- `v2-baseline-desktop.png` — 1440 × 900 viewport
- `v2-baseline-tablet.png` — 1024 × 900 viewport
- `v2-baseline-mobile.png` — 390 × 844 viewport

Capture used a temporary build-backed instance on port 3001 with the
repository-documented `APP_AUTH_MODE=trusted-network` test mode. The production
instance on port 3000 remained in fail-closed Cloudflare Access mode throughout.
The temporary instance was stopped immediately after capture.

### 59-second home request inventory

| Endpoint | Requests | Observed times (seconds) | Effective cadence |
| --- | ---: | --- | --- |
| `/api/widgets/homelab` | 8 | 0.4 (twice), 15.4 (twice), 30.4 (twice), 45.4 (twice) | 15s, duplicated |
| `/api/widgets/homelab-detail` | 2 | 0.4, 30.4 | 30s |
| `/api/widgets/esports/matches` | 2 | 0.4, 30.4 | 30s |
| `/api/vault` | 1 | 0.4 | initial load |
| `/api/widgets/weather` | 1 | 0.4 | initial load |
| `/api/widgets/calendar` | 1 | 0.4 | initial load |
| `/api/widgets/news` | 1 | 0.4 | initial load |
| `/api/widgets/esports/rankings` | 1 | 0.4 | initial load |
| `/api/widgets/esports/stats` | 1 | 0.4 | initial load |
| `/api/widgets/esports/news` | 1 | 0.4 | initial load |

The duplicate light homelab poll is the only repeated identical request: the
dashboard chrome provider and the homelab widget each own a 15-second poll.

## Task 1 — normalized operational health

- Extended `WidgetResponse<T>` with optional `staleAt`, `maxAgeMs`, and a
  sanitized machine-readable `reasonCode` without breaking existing routes.
- Added a pure `OperationalSignal` normalization layer with explicit healthy,
  degraded, down, stale, not-configured, and disabled states.
- State precedence is configuration → total failure → freshness → partial
  degradation. Disabled and unconfigured optional features never become
  incidents.
- Aggregate normalization preserves partial service success as degradation and
  marks the aggregate down only when every requested slice failed.

## Task 2 — coordinated client data

- Replaced per-hook intervals with a shared, dependency-free coordinator keyed
  by request URL. Subscribers share the shortest requested cadence and never
  overlap an in-flight request.
- Hidden tabs pause polling. Visibility regain and browser-online events trigger
  immediate revalidation.
- Transport failures use bounded exponential backoff with ±20% jitter and a
  five-minute ceiling; a successful response resets the failure count.
- The final unsubscribe aborts in-flight work. Last-known-good payloads remain
  visible with explicit stale freshness during temporary failures.
- Internal server consumers remain direct `lib/` function calls; no route was
  combined with another source or opened around Cloudflare Access.
