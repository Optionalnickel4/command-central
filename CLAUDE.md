# Command Central — working constraints

## Current branch and scope

Production is the existing main build in LXC 220. The jarvis-v2-core branch is the Axiom live-migration review branch. Phases 0-7 are complete in an isolated worktree. Do not switch the production checkout or restart the production service until deployment is explicitly approved.

Read docs/AXIOM-LIVE-REVIEW.md, docs/AXIOM-DESIGN-REVIEW.md, and docs/V2-CORE-IMPLEMENTATION-LOG.md for current evidence and boundaries. JARVIS-V2 at 1925757 is frozen reference logic, not a branch to merge. Earlier visual briefs in docs are historical, not current instructions.

## Security and operating rules

1. Preserve fail-closed Cloudflare Access authentication in proxy.ts. Production defaults to cloudflare-access. Unauthenticated requests, including localhost, must return 401.
2. APP_AUTH_MODE supports cloudflare-access, trusted-network, and off. Nickel explicitly authorized auth-disabled/trusted-network **isolated build testing** on 2026-09-06, but no auth-flow changes without asking. Scope test overrides to a throwaway process bound to 127.0.0.1; never alter production configuration to make a 401 disappear.
3. Internal consumers import the lib data function behind a route, never call protected routes over loopback. No bypass token, local-IP exemption, or matcher exemption.
4. Proxmox uses Node https in lib/pve.ts, not fetch/undici. The self-signed endpoint requires this existing mechanism. Preserve it.
5. The SSH key to OpenClaw is restricted to its existing wrapper. Do not widen authorized_keys, add commands to the wrapper, copy the key, or use it for arbitrary operations.
6. Keep secrets only in the existing gitignored .env.local. Do not print, copy, commit or modify that file. Compare its fingerprint before/after without displaying the fingerprint.
7. Preserve origin validation, request/body bounds, rate/concurrency limits, sanitization, and Vault path/symlink protections. Vault writes remain explicit-confirm, append-only proposals.
8. Every live GET API route must be force-dynamic. Source failures remain independent. Partial success remains usable; total upstream failure is a failure, not fabricated health.
9. Before an approved production restart, build successfully in the correct checkout. Never use a broad process kill: target only the exact recorded test PID after verifying its identity.
10. No production action is needed for static review. An unauthenticated production 401 is a successful security check; it is not evidence that the underlying data source failed.

## Architecture

- Next.js 16 / React 19 / TypeScript / Tailwind. Keep the framework and self-hosted fonts.
- components/dashboard-shell.tsx wraps the Axiom shell, which consumes semantic surfaces from components/widgets/registry.ts. Do not hand-import domain widgets into the shell.
- components/axiom contains the live shell, normalized source adapters, panes, modal/state primitives, and retained fixture references for static-review history.
- app/axiom.css owns Axiom tokens, responsive geometry, z-index, focus and forced-color/reduced-motion behavior.
- Registry metadata: stable id, domain, priority, surface, density, visibility, destination, capability and renderer.
- lib/operational-health.ts normalizes health, freshness, severity and incident order.
- lib/fetcher.ts coordinates shared requests, cadence, visibility, online state, backoff, cancellation and last-known-good freshness. Preserve focused behavior tests.
- lib/presentation-state.ts supplies shared labels and non-color state symbols.
- Source-specific routes and lib functions are retained for later migration, except sports integration, which is removed only from V2-Core.
- Compatibility surfaces remain at /sol and /vault, and legacy media remains at /legacy/media. The primary /agents, /projects, and /media destinations now use Axiom styling over existing protected routes.
- Historical HUD CSS remains only for those legacy views; boot, orbital home clusters, home ticker and permanent orb are retired from Axiom.

## Adding a source later

Create a force-dynamic server route wrapping the existing or new lib source function; return WidgetResponse with status, updatedAt and honest freshness metadata. Add a semantic registry entry and renderer. The shell must depend on normalized source-independent signals; browsers never call LAN backends directly. No new infrastructure integration belongs in the current design phase.

## Verification

Run npm test, npm run lint, npm run build and git diff --check. Use the isolated localhost-only trusted-network server for browser tests, never a modified production auth flow. node scripts/axiom-verify.mjs records static-review widths, semantics, accessibility, interactions and screenshots. node scripts/axiom-live-verify.mjs records live-route widths, accessibility, interactions, failure recovery, request counts, bundle size, idle task time, and screenshots. Test receipts are under docs/screenshots/axiom-static and docs/screenshots/axiom-live.

After live migration, additionally verify direct/lib or isolated HTTP live Proxmox data, Sol and Claude turns, Piper and microphone capabilities, media partial failures, Vault protection, request counts, real failure recovery and performance. Static sample success must not be described as those live checks passing.

Axiom belongs to Command Central only; do not apply its visual language to unrelated projects by default.
