# Axiom live-data review

**Status:** Live-data migration is complete on `jarvis-v2-core` for review. Production is unchanged on `main`; deployment still requires explicit approval.

## What changed since static approval

- Command, Systems, Agents, Media, Projects, Activity, and Settings now use existing live Command Central sources through normalized Axiom signals.
- Estate inventory is based on observed Proxmox node/guest data, with known host-to-guest relationships only.
- Optional unconfigured sources are informational, not incidents.
- Media service failures remain isolated; total media failure is still a failure.
- Projects replaces the primary Vault label while preserving read-only browsing and explicit-confirm append-only proposal protections.
- Agents exposes Sol, Claude, Piper, microphone capability messaging, stop speech, mute, pending, and failure states without changing backend transports.
- Legacy compatibility remains: `/sol`, `/vault`, and `/legacy/media` are still available.

## Evidence

- Tests: 19 files / 297 tests passed. Receipt: `docs/screenshots/axiom-live/phase-live-test.txt`.
- Lint: passed. Receipt: `docs/screenshots/axiom-live/phase-live-lint.txt`.
- Build: passed. Receipt: `docs/screenshots/axiom-live/phase-live-build.txt`.
- Browser matrix: 390, 768, 1024, 1440, and 1920 CSS-pixel widths across all seven destinations.
- Layout: 0 target-width overflows; one h1 per checked route; max route CLS 0.09612643473307292; final measured CLS 0.020664247564621915; LCP 148 ms.
- Accessibility: 0 WCAG A/AA axe violation groups in the checked matrix.
- JavaScript errors: 0 page errors.
- Request window: 9 API requests in 59 seconds; baseline was 19 and old V2 baseline was 18.
- Decoded initial JavaScript: 509456 bytes; baseline was 527,421 bytes.
- Idle main-thread task time during the measured window: 0.10921700000000001 seconds.
- Sol test turn: HTTP 200, marker returned.
- Claude test turn: HTTP 200, marker returned.
- Piper synthesis: HTTP 200, WAV returned (80940 bytes).

## Artifacts

- Live verification JSON: `docs/screenshots/axiom-live/verification.json`.
- Service-turn JSON: `docs/screenshots/axiom-live/services.json`.
- Desktop overview screenshot: `docs/screenshots/axiom-live/command-1440.png`.
- Mobile overview screenshot: `docs/screenshots/axiom-live/390-viewport.png`.
- Route screenshots: `docs/screenshots/axiom-live/{systems,agents,media,projects,activity,settings}-{390,1440}.png`.
- Failure-state screenshots: `docs/screenshots/axiom-live/one-source-stale.png` and `docs/screenshots/axiom-live/total-failure.png`.
- Reduced-motion and forced-colors screenshots: `docs/screenshots/axiom-live/reduced-motion.png`, `docs/screenshots/axiom-live/forced-colors.png`.
- Interaction video: `docs/screenshots/axiom-live/video/page@792d46abb1b8a9c4a909252df9f3e17f.webm`.

## Boundaries preserved

- No production checkout switch, service restart, or deployment was performed.
- The isolated test server used `APP_AUTH_MODE=trusted-network` and `APP_ALLOWED_ORIGINS=http://127.0.0.1:3101` only in its own loopback process.
- No authentication-flow code was changed.
- No browser calls LAN backends directly; browser requests stay on Command Central API routes.
- The Proxmox client remains the Node `https` implementation required for the self-signed endpoint.
- No Vault permissions were widened; traversal, symlink, and explicit-confirm append-only tests pass.
- No VLR/esports runtime route or environment dependency remains in V2-Core. Remaining `vlr-api` strings are generic Vault/project fixtures or historical comments/tests.

## Deployment gate

Before production deployment: fetch/rebase if needed, verify `main` rollback head, compare `.env.local` fingerprint without printing it, run build in the production checkout after branch switch, restart only the `command-central` service, confirm unauthenticated production still returns 401, and inspect logs for new repeating errors.
