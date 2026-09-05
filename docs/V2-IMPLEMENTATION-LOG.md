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

## Task 3 — attention-led overview

- Added an Attention / All Clear band and compact estate summary before the
  orbital cockpit. Incidents are normalized, sorted by severity, timestamped,
  and link to the relevant detail surface.
- Registry entries now carry priority, size, display policy, and detail links.
  `dashboard-shell.tsx` still imports no individual widget implementation.
- Calendar stays prominent. Detailed homelab rows, weather, news, and esports
  rails remain available behind labeled disclosure instead of competing with
  incidents and the assistant entry point.
- Removed numbered section ornaments in favor of descriptive section labels.

## Task 4 — shared widget presentation states

- Added shared panel frame, title, state badge, skeleton, empty, freshness, and
  sanitized failure primitives. Every state uses text and an icon in addition
  to color, and timestamps use machine-readable `<time>` elements.
- Migrated the home weather, calendar, news, homelab, and shared esports failure
  paths. Raw transport errors are no longer rendered by the homelab panel.
- `aria-live` remains limited to the top incident summary; ordinary polling
  does not create repetitive screen-reader announcements.

## Task 5 — detail workflows and navigation

- Added a shared primary navigation model to Overview, Systems / Sol, Media,
  Vault, and esports detail. Esports navigation disappears with its feature
  flag, matching registry content behavior.
- Incident destinations have stable hash targets. A shared hash-focus helper
  moves keyboard focus to the visible destination without converting pages into
  one client-side application.
- Sol status still leads with runtime, tasks, and audit information before the
  separate usage view. Media still leads with active streams and queues before
  catalog totals; failed service slices remain independently usable.
- Vault read/write code was not broadened or changed. Confirmation and
  append-only protections remain under the existing security tests.

## Task 6 — responsive, accessibility, and motion pass

- Added a skip link and consistent `main` target, global visible focus rings,
  focusable incident destinations, and 44px disclosure/navigation targets.
- Mobile and tablet orb caps keep operational status and the assistant console
  ahead of decoration. Layout verification covers 390, 768, 1024, 1440, and
  1920 CSS-pixel widths plus a 200% zoom-equivalent viewport.
- Reduced motion disables boot, parallax transforms, conduits, ticker, orb,
  gauges, graphs, and decorative background motion while retaining content.
- Small labels use brighter cyan/slate tones in new v2 components; state is
  never communicated by opacity or color alone.

Browser verification: zero horizontal overflow at 390, 768, 1024, 1440, 1920,
and a 720px 200%-zoom-equivalent viewport; one `<h1>` and primary navigation at
every width; skip link is the first tab stop. Reduced-motion computed animation
names were `none` for grid, orb, and ticker. axe-core WCAG 2 A/AA and 2.1 A/AA
reported zero critical or serious violations.

## Task 7 — verification and rollout

Documentation now reflects the actual framework versions, fail-closed auth,
live sources, normalized health model, coordinator, registry metadata, and
build-before-restart workflow. Final verification receipts and request-count
comparison follow below. Production rollout remains a separate, explicitly
approved controlled restart; this branch does not merge or restart by itself.

The first real-browser request trace exposed Chromium's receiver requirement
for native timer and fetch functions (`Illegal invocation`). The coordinator
now calls them through `globalThis` wrappers; the final trace below is taken
after that correction.

### Final verification receipts

- `npm test`: pass — 22 files, 328 tests.
- `npm run lint`: pass.
- `npm run build`: pass on Jarvis with production environment present.
- Unauthenticated production `/`: 401 with `{"error":"unauthorized"}`.
- Isolated trusted-network routes: 200 for `/`, `/sol`, `/media`, `/vault`,
  and `/esports/player/3799`.
- Direct homelab data path: 200 / `status: ok`, one node and 14 guests.
- Sol chat: 200 and exact verification marker returned.
- Claude chat: 200 and exact verification marker returned.
- Piper: 200 `audio/wav`, 101,420 bytes.
- Degraded/down and config-absent behavior: covered by operational-health,
  response-status, and media tests; vault traversal, symlink, and explicit
  append-confirm safeguards pass in the full suite.
- Final isolated-instance log: clean startup, no repeating errors.
- Production service: active and unchanged; no restart performed.

### Request-count comparison

The same 59-second window dropped from **19 to 18 total browser API requests**
despite adding media and assistant health to the estate summary. Most
importantly, `/api/widgets/homelab` dropped from **8 to 4** requests: one at
load and one per 15-second cadence instead of two simultaneous polls. Media and
assistant health use a 60-second cadence with a 150-second stale boundary.

After screenshots and validation, the isolated port-3001 instance was stopped.
Production remains on its pre-v2 artifact until an explicitly approved restart.
