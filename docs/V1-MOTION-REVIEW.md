# Command Central: V1 Motion Review

Date: 2026-09-06
Branch: jarvis-v1-plus
Preview: http://10.0.0.22:3102

## Scope

Preserves the v1 cockpit, widget registry, esports, voice analyser, and existing destinations. Adds Motion 13.2.0 for staggered panel arrivals, animated guest disclosure, shared-layout backend selection, message entry, and orb caption changes. Darker panel surfaces retain the cyan/amber HUD framing. Mobile title and status now occupy separate rows.

Refresh feedback is local to the widget context. It compares data and status, ignoring envelope timestamps: a new timestamp alone does not trigger an effect. Reduced motion disables new movement, and hidden tabs suppress refresh effects. Poll cadence and backend routes are unchanged.

3D is deliberately deferred to a later visual pass.

## Verification

- Lint, 311 tests, and production build pass.
- Browser matrix covers 390, 768, and 1440 pixels: expansion/collapse, backend selection, overflow, headings, axe A/AA, and reduced motion.
- Controlled weather polling: four requests, one actual data change, exactly one weather-only feedback animation.
- A live Claude chat check returned HTTP 502. Backend recovery is not claimed. The successful-message recording uses a clearly labeled intercepted fixture, not a live assistant response.
- Production remains clean main at 90732ec with unauthenticated HTTP 401.
- Container filesystem is already 20 GB, with about 12 GB free; no resize was required.

## Artifacts

See screenshots/v1-motion/ for desktop/mobile screenshots, interactions.webm, verification.json, and feedback-check.json. The recording includes fixture chat and a reduced-motion check. Local artifacts also retain live-verification.json with the failed live chat result.

The preview runs separately on port 3102. No production deployment is included.
