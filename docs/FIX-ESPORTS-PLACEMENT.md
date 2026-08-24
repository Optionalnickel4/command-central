# FIX ESPORTS PLACEMENT — RIGHT COLUMN, NOT A FULL-WIDTH BAND

WHAT'S WRONG: Phase 3 put esports in a new full-width "wide" cluster BELOW the
whole cockpit. That was the wrong empty space. It made the page much taller (now
needs scrolling) and spawned a scroll-to-top button. The user wanted esports in
the OPEN SPACE ON THE RIGHT — the empty area under the news/general panel in the
RIGHT COLUMN — so it fits on the existing screen without a big scrolling slab.

GOAL: esports lives in the right column, COMPACT, and the whole dashboard fits on
one screen again (no full-page scroll just to see it).

## DO THIS

1. Move the esports widgets OUT of the full-width "wide" cluster and INTO the
   right column (the "general" side — same cluster as weather/calendar/news),
   below the existing general widgets. Use the registry cluster field to do this
   — don't hand-place. If the "wide" cluster is now unused, remove it and revert
   the shell/registry changes that introduced it.

2. Make them fit a narrow column — COMPACT versions:
   - Scoreboard: a single "LIVE / NEXT" match tile (one match — the live one, or
     the next upcoming with countdown), not three side-by-side big tiles.
   - Rankings + R2.0 leaderboard: short (top 5), column-width, scrollable if
     needed rather than tall.
   - VLR Wire ticker: keep it, it's already compact.

   The point is column-width density, not a stadium scoreboard.

3. Because esports no longer makes the page tall, REMOVE the scroll-to-top
   floating button entirely (it's off-palette and now unnecessary). If it was
   added as a component, delete it and its usage.

4. Verify the whole dashboard fits without major vertical scroll at a normal
   desktop height (e.g. 1080p) — use your browser/screenshot tool to CONFIRM the
   page isn't massively taller than the viewport anymore, esports is visible in
   the right column, and there's no blue button.

## CONSTRAINTS

Presentation/layout only. Don't change the esports API routes' behavior, the
Proxmox path, the SSH-to-Sol transport, or the chat backends. Keep the
registry/cluster pattern. Data stays exactly as built — this is purely WHERE
and HOW BIG the esports section renders.

Screenshot before/after, confirm it fits, then STOP and report. Leave other
polish (micro-label contrast, region choice) alone unless asked.
