# PLAYER RADAR / DETAIL PAGE — esports panel

Build a player DETAIL view: click a player somewhere in the esports UI → land on that
player's page → see a radar/spider chart of their 4-axis dimensions plus their
profile/stats. One player at a time (NO comparison overlay this round).

The dimensions data is already wired for the assistant lookup
(/players/{id}/dimensions). REUSE that fetch path (lib/vlr.ts) — don't add new access.

## STEP 0 — CONFIRM THE SHAPE FIRST (don't assume from memory)

Re-curl /players/{id}/dimensions for a REAL player id and confirm:
- How many axes, and their labels.
- Whether values are ALREADY percentiles (0-100) or raw stats on different scales.

THIS DECIDES THE CHART:
- If percentiles (0-100): plot directly, axis max = 100.
- If raw numbers on different scales: you MUST normalize per-axis or the radar is a
  meaningless spike. Pick a defensible normalization and note what you chose.
- Also re-curl /players/{id} (profile) and /players?q= so the page can resolve a
  name/id and show profile + stats alongside the radar.

Paste the real shapes you confirmed in your report.

## THE RADAR CHART

- Hand-rolled SVG (recharts is NOT installed — match the existing hand-rolled SVG
  charts on /sol). N axes at equal angles, each value a point along its axis from
  center (0) to edge (max), connected into a polygon, filled semi-transparent.
- HUD aesthetic: arc-reactor cyan / gold on near-black. Grid rings (25/50/75/100),
  axis spokes, axis labels at the outer ends, glowing cyan polygon. Per-axis value
  readouts are a plus.
- Degenerate cases: missing/null axis value (don't crash), all-equal values, a player
  with no dimensions data at all (show "no dimensional data" not a broken chart).
- Respect reduced-motion; keep it readable static.

## THE PAGE

- A player detail route (e.g. /esports/player/[id]); pattern-match /sol for layout,
  boot feel, and back-nav.
- Content: name/handle, team if listed, the radar, and stat lines (per-agent
  ratings/ACS/KD/KAST).
- Back navigation, client-side, like /sol.

## HOW YOU GET THERE

- Make player names clickable where they already appear — the R2.0 / stats
  leaderboard is the natural entry point. If ids aren't in that data, resolve via
  /players?q=<name>.
- A minimal player search input is an acceptable fallback entry point.

## VERIFY

- Build passes, / and /sol still 200, no console errors, homelab/esports/sol/TTS ok.
- Screenshot the radar for a REAL player — polygon renders, axes labeled, values sane.
- Click-through works; back nav returns.
- Missing/partial dimensions degrades gracefully.
- Report: confirmed shapes, normalization choice, screenshot.

## CONSTRAINTS

esports/player UI + lib/vlr.ts only. Reuse existing vlr access. Don't touch Proxmox,
SSH transports, the sol routes, TTS, the orb, or the chat/lookup logic. Single player
only.

Build it, verify with a real player + screenshot, then STOP and report.
Remind the user to commit + push.
