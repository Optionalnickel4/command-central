# V2-Core — Axiom implementation log

**Current status: Phases 0-7 complete on jarvis-v2-core; live-data review ready. Production unchanged.**

## 2026-09-06 — Phase 0, baseline collected; authentication gate pending

The complete authoritative host brief and repository CLAUDE.md were read before implementation. No application changes, commits, branch switch, service restart, or deployment have occurred.

### Verified starting state

- Production checkout: main, clean, at 90732ec9d15a03e3a07109f590ebd0ee64a46aba.
- Fetch completed; origin/main equals main with no divergence.
- Preserved reference: JARVIS-V2 at 1925757b227f6c3d329ed19a30284cc29b4b0421.
- Node v22.23.2; npm 10.9.8.
- Production service active; MainPID 11960; start time 2026-09-06 06:43:37 UTC, unchanged after baseline.
- Unauthenticated production request: HTTP 401 before and after baseline.
- Existing gitignored .env.local is present and fingerprint comparison confirms unchanged. No contents or fingerprint were printed, copied, or committed.

### Isolation

Baseline builds ran in a detached worktree at the exact main commit, leaving the production checkout and its .next artifacts untouched. The implementation branch jarvis-v2-core has NOT yet been created because the mandatory baseline gate remains incomplete. Only review documents and baseline artifacts are untracked here.

The isolated baseline server loaded the existing environment in memory without copying the environment file. APP_AUTH_MODE=trusted-network was scoped to that throwaway process, bound only to 127.0.0.1:3101. Production configuration was unchanged. The exact recorded test PID was stopped after capture; no broad kill command was used.

### Baseline receipts

- npm ci: passed.
- npm test: 17 files / 311 tests passed.
- npm run lint: passed.
- npm run build: passed.
- Raw sanitized test/lint/build receipts: docs/screenshots/axiom-baseline/{test,lint,build}.txt.
- Captures: docs/screenshots/axiom-baseline/{390,768,1024,1440,1920}.png.
- 59-second home API request inventory: 19 requests; homelab 8, homelab-detail 2, esports matches 2, seven other endpoints 1 each. Exact timestamps are in requests.json.
- Initial decoded JavaScript resource bytes: 527421 (browser resource-timing measurement, not gzip transfer or a complete performance benchmark).
- 390px viewport document width: 449px; 768, 1024, 1440, and 1920 have no horizontal overflow. Exact readings are in layout.json.

### Mandatory gate / unresolved evidence

These captures are from the authorized isolated trusted-network test mode, NOT authenticated production captures. The brief explicitly requires authenticated screenshots in Phase 0. No connected authenticated browser is available. Nickel has been asked whether the isolated captures may substitute; no exception is assumed while the answer is pending. Do not begin Phase 1 or report Phase 0 complete until this is resolved.

### Implementation reconnaissance (no changes)

The current lookup-intent module is esports-only; removing it must preserve normal chat dispatch, context, request validation, rate/concurrency limits, usage, and Vault write behavior. Generic Vault fixtures containing a project named vlr-api are not active esports runtime coupling and must not be indiscriminately removed. V2 foundation candidates are lib/operational-health.ts, lib/fetcher.ts, response metadata, and their focused tests, not a broad branch merge. Existing Next/React, self-hosted Inter/JetBrains Mono, Playwright, and repository-native coordinator suffice; no third-party dashboard platform is needed for this explicitly custom design.

### Next action

Resolve baseline evidence gate, create jarvis-v2-core from verified main in this isolated worktree, commit the baseline record, then execute Phases 1–3 in order. Live migration and deployment still require separate design approval. Production remains on its existing main build, so no rollback action is currently necessary.

## 2026-09-06 — Baseline exception authorized

Nickel authorized trusted-network / disabled authentication for isolated build tests, with no authentication-flow changes without asking. The already collected localhost-only test captures are accepted as the Phase 0 baseline under this authorization; they are not represented as authenticated Cloudflare captures. Production stays fail-closed, its configuration is untouched, and the override is process-scoped only. Implementation proceeds through Phases 1–3, then stops at the static design-review gate.

## Phase 1 — Esports removal

Removed all sports routes, pages, widgets, upstream clients, feature flags, assistant lookup/prepass and snapshot slices, dedicated tests and feature documentation. Generic project/Vault fixtures remain intentionally: project names are not runtime integrations. Added runtime dependency/config/route boundary coverage. Chat dispatch, validation, origin/rate/concurrency guards, usage recording, restricted transport and Vault writes are unchanged. Checks: 263 remaining tests, lint and build passed before adding removal coverage; boundary test receipt follows. No production changes.

## Phase 2 — Selective foundation port

Ported only operational-health and request coordinator logic with their focused tests from frozen JARVIS-V2, plus response freshness metadata and source-independent presentation semantics. No visual components or broad branch merges. Removed sports domain from the port. Added regressions for hidden-tab freshness expiry, HTTP error-envelope backoff, hard jitter cap, aborted-request remount race, and sanitized transport failures. SSR uses a stable empty coordinator snapshot. All 288 tests, lint and build pass.

## Phase 3 — Static Axiom design-review gate

Built a fixture-only shell with semantic registry composition, seven stable preview routes, estate topology/list, attention and context rails, local navigation palette, focus-managed URL-addressable inspector, mobile summary and More navigation. Self-hosted existing fonts; no new runtime dependencies. Retired home boot/orb/ticker/orbital components. Legacy Sol/Vault and media surfaces remain available explicitly; no live source migration is claimed.

Evidence: 288 tests, lint and build pass. Browser matrix: five widths without document/element overflow, one h1, zero idle animations, no JS errors, no API requests. WCAG A/AA scans of widths, states, inspector and all seven destinations: zero violations. Keyboard, touch, focus restoration, query deep-link reload, palette filtering, editable-field guard, inventory filtering, 44px touch targets, forced colors and reduced motion pass. 200% equivalent reflow captured; actual browser-menu zoom is deferred to final release verification. Screenshots and interaction recording are under axiom-static, with an HTML gallery and review document.

Decoded initial JS is 490657 bytes (baseline 527421); zero static API calls is not a live performance result. Remaining live-source, voice/chat, Core Web Vitals and release checks are explicitly deferred. The test instance used a process-scoped trusted-network mode bound only to localhost and is now stopped. No production environment was copied into it. Production PID remains 11960, clean main remains at 90732ec, unauthenticated HTTP remains 401, environment fingerprint unchanged, frozen JARVIS-V2 remains at 1925757. No auth-flow/security/Proxmox/Vault-write changes.

Next: Nickel reviews the static design and interaction map before Phase 4. No production deployment or restart authorized by the test-mode exception.

## 2026-09-06 — Phases 4-7, live migration verified

Nickel approved the static Axiom shell and interaction map, then Phase 4 resumed in the isolated `jarvis-v2-core` worktree. No production checkout switch, service restart, deployment, auth-flow change, or environment modification was performed.

### Live migration

- Connected the Command overview, assessment, attention rail, estate core, inspector, context rail and utilities to existing live Command Central sources through normalized Axiom signals.
- Migrated Systems, Agents, Media, Projects, Activity and Settings to Axiom primitives while preserving the existing `/sol`, `/vault` and `/legacy/media` compatibility surfaces.
- Added real Proxmox node-to-guest relationships, template/intentional-stop handling, optional-source configuration handling, freshness metadata defaults, and isolated media-source severity.
- Preserved direct internal `lib/` source access for server consumers, browser-to-API boundaries, Node `https` Proxmox transport, request origin/body/rate/concurrency guards, and Vault traversal/symlink/explicit-confirm append-only protections.
- Capped the initial Media operations list behind an explicit show-all control and stabilized live-loading layouts to avoid delayed content layout shift.

### Live verification receipts

- `npm test`: 19 files / 297 tests passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- Sol test turn: HTTP 200 and marker returned.
- Claude test turn: HTTP 200 and marker returned.
- Piper synthesis: HTTP 200 audio/wav returned.
- Browser matrix: Command, Systems, Agents, Media, Projects, Activity and Settings at 390, 768, 1024, 1440 and 1920 CSS pixels.
- Automated checks: zero page errors, zero target-width overflows, one h1 per checked route, zero WCAG A/AA axe violation groups, max recorded route CLS 0.096, final 59-second-window CLS 0.021, LCP 148 ms.
- Request inventory: 9 API requests in 59 seconds, down from Phase 0 baseline 19 and below old V2's 18-request measurement.
- Decoded JavaScript: 509,456 bytes, below Phase 0 baseline 527,421 bytes.
- Idle main-thread task time in the measured window: 0.109 seconds.
- Failure checks: one-source stale keeps labeled last-known data, online refresh recovers, total API failure does not claim health.
- Receipts and screenshots are under `docs/screenshots/axiom-live/`; summary is `docs/AXIOM-LIVE-REVIEW.md`.

### Production boundary

Production remains clean `main` at `90732ec9d15a03e3a07109f590ebd0ee64a46aba`, serving the existing build. Unauthenticated production HTTP still returns 401. The only extra Next process is the isolated loopback review instance on 127.0.0.1:3101, which must be stopped after packaging. Deployment remains a separate explicit approval gate.
