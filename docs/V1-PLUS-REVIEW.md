# Command Central v1-plus review slice

**Branch:** `jarvis-v1-plus`  
**Baseline:** `main` at `90732ec`  
**Preview:** `http://10.0.0.22:3102` running with `APP_AUTH_MODE=trusted-network`  
**Production:** unchanged on `main` at port 3000

## Direction

This pass keeps the v1 cockpit, orb, conduits, command bar, widget registry, esports surfaces, and general Command Central feel. It does not reuse the Axiom shell.

## Changes in this slice

- Shared widget polling now exposes refresh state and triggers a brief global refresh glint when new widget data lands.
- Weather, calendar, news, and homelab panels show compact live/sync/setup/degraded/offline pills instead of silent or uneven states.
- Homelab loading/error states use the v1 HUD panel language with calmer skeleton motion and clearer failure text.
- Assistant messages animate in lightly; input, mic, backend, and send controls have better hover/active/focus feedback.
- Mobile overflow from ticker/command chips is fixed by containing marquees and allowing bottom shortcuts to wrap.
- Reduced-motion mode disables the new animation layer.
- Low-contrast section numbers were brightened.

## Verification

- `npm run lint` passes.
- `npm test` passes: 311 tests / 17 files.
- `npm run build` passes with `.env.local` loaded from the existing production secret file symlink; contents were not printed.
- Browser verification against the isolated preview:
  - no JavaScript console/page errors;
  - no width overflow at 390, 768, or 1440;
  - one `h1` at each checked width;
  - zero axe WCAG A/AA violations at checked widths;
  - reduced-motion capture reports zero active animations.

## Screenshots

- `docs/screenshots/v1-plus/dashboard-390.png`
- `docs/screenshots/v1-plus/dashboard-768.png`
- `docs/screenshots/v1-plus/dashboard-1440.png`
- `docs/screenshots/v1-plus/dashboard-390-reduced-motion.png`
- `docs/screenshots/v1-plus/verification.json`

## Notes

Production remains on v1/main. This is a review branch only; deploy after explicit approval.
