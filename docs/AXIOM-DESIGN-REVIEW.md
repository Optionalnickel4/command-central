# Axiom — static design review

**Status:** Phases 0–3 complete. Awaiting Nickel's design approval. Not deployed.

## What to review

- A calm, spatial estate workspace, with amber reserved for actionable attention.
- Navigation rail, intelligence bar, supporting operations/agent panes, context rail.
- Mobile puts assessment and attention ahead of the compact estate summary.
- Explicit inspect controls, side inspector/full-height mobile sheet, normal destination links.
- All-clear, attention, stale, and outage presentations; no continuous idle animation.
- Self-hosted Inter and JetBrains Mono; repository-native SVG icons and CSS, no paid service or added runtime dependency.

The seven primary destinations render **sample-data design previews**, not migrated live pages. The previous Sol and Vault surfaces remain at /sol and /vault; the previous media view is retained at /legacy/media. Their live migration, full interaction polish, and compatibility decisions are later phases.

## Interaction map

| Control | Result | Boundary |
|---|---|---|
| Rail / mobile destinations | Normal URL navigation | Back/forward and opening links in another tab preserved |
| Collapse rail | Compact labeled-accessibility navigation | Explicit expand control |
| Estate Topology / List | Same seven sample entities in two views | No backend requests |
| Inspect entity | URL query `inspect=<id>`, focus on heading | No service action |
| Inspector close / Escape | Close and restore invoking focus | Native dialog modality contains focus |
| Open entity destination | Normal detail-domain URL | Static preview at this gate |
| / or Ctrl/Cmd+K | Local navigation palette | Ignored inside editable fields |
| Sample-state controls | Deterministic healthy/attention/stale/outage | Not a claim of live failure recovery |
| More (mobile) | Full destination menu | Visible labeled controls |
| Legacy links | Existing read-only/live surfaces | Existing auth and service boundaries unchanged |

The inspector is a modal right-side panel on desktop and a full-height sheet on mobile for this review. Its layout is stable; background interaction is disabled while open. A nonmodal desktop variant can be selected during design review before live integration.

## Evidence

See [screenshot gallery](screenshots/axiom-static/index.html), [desktop](screenshots/axiom-static/1440.png), [mobile first viewport](screenshots/axiom-static/390-viewport.png), and [interaction recording](screenshots/axiom-static/interaction-review.webm).

- 288 unit/behavior tests passed.
- Lint and production build passed.
- All seven preview destinations scanned; **zero accessibility violations** in the WCAG A/AA scan matrix.
- Widths 390, 768, 1024, 1440, 1920: no document or element overflow, one h1, zero active animations.
- 720 CSS-pixel reflow check models a 1440px viewport at 200% zoom; actual browser-menu zoom remains a later manual release check.
- Pointer, keyboard and touch inspection/navigation, focus restoration, deep-link reload, editable-field shortcut guard and 44px touch targets verified.
- Reduced-motion and forced-colors captures included.
- No page errors and **zero API calls from the static preview**.
- Decoded initial JavaScript: **490,657 bytes** vs baseline **527,421 bytes** (about 7% lower). This is not a live-data performance result.
- Production remains clean main at 90732ec, PID 11960, unauthenticated HTTP 401.
- Existing .env.local fingerprint matches the baseline; auth implementation, request security, chat validation, Node HTTPS Proxmox transport, and Vault write code unchanged.
- JARVIS-V2 remains at 1925757.

## Test reproduction

In the isolated review worktree, run `npm test`, `npm run lint`, and `npm run build`. For fixture review, start Next with APP_AUTH_MODE=trusted-network on **127.0.0.1:3101 only**, then run `node scripts/axiom-verify.mjs`. No production environment file is needed for the sample shell. Capture and stop only the recorded isolated PID; never use a broad process kill.

Trusted-network testing was explicitly authorized by Nickel on 2026-09-06. It is a process-scoped test setting, not a change to Cloudflare Access or the application's auth flow.

## Deferred, not claimed complete

- Live normalized-source migration and adapters.
- Full Systems table sorting/filtering and finalized deep-page content.
- Chat, Claude/Sol test turns, Piper playback, microphone capability verification in Axiom.
- Live failure/recovery, hidden/online behavior in the migrated UI (coordinator behavior is unit-tested now).
- Core Web Vitals, idle CPU, slow-network release tests, actual browser zoom, final deployment review.
- No production restart, branch switch, or public review deployment.

## Rollback / next action

There is nothing to roll back in production: its checkout and existing build were never changed. Keep main and its build intact. Stop the isolated test PID if running. After design approval, continue Phase 4 in jarvis-v2-core; deployment still requires separate explicit approval after final verification.
