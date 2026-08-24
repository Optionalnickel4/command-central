# MEDIA PAGE — two cosmetic polish fixes

The `/media` page is functionally complete and correct. Two purely-VISUAL fixes,
no data or endpoint changes. Screenshot before/after so the user can see both land.

## FIX 1 — transcode reason line: move to hover/expand

On the NOW PLAYING panel, the transcode reason (e.g. "reason: ContainerNotSupported")
currently renders inline in a warning-ish red/orange color, which reads as an ALERT.
It's not an alert — it's just Jellyfin explaining WHY it's transcoding (the client
can't direct-play that container). Keep the info, but get it off the panel face:

- Do NOT show the reason line inline by default.
- Instead, reveal it on hover/expand of the TRANSCODE badge (or the session row) —
  a title/tooltip on the TRANSCODE badge is the simplest
  ("Transcoding: ContainerNotSupported"), or a small expand toggle if you prefer.
  Either is fine; tooltip on the badge is cleanest.
- The TRANSCODE badge itself stays visible (that's useful at-a-glance). Only the
  reason text moves to hover.
- When present, style any revealed reason as neutral/informational (dim cyan or
  grey), NOT warning red — it's metadata, not a problem.
- Direct-play sessions (no transcode) are unaffected — no badge, no reason.

## FIX 2 — NOW PLAYING panel: size to content (kill the empty gap)

With a single active stream there's a large empty band below the NOW PLAYING panel
before the DOWNLOADS/REQUESTS row — the panel is reserving height for multiple
streams and leaving dead space when only one is playing.

- Let the NOW PLAYING panel size to its CONTENT: one stream = short panel, multiple
  streams = taller, "Nothing playing" = compact. Remove the fixed/min height (or the
  grid row stretch) that's causing the reserved space.
- The row below should flow up naturally when now-playing is quiet — no big gap.
- Must still look right in ALL three states: 0 streams (compact "Nothing playing"),
  1 stream (no gap — the bug case), and 2-3 concurrent streams (panel grows, still
  laid out cleanly). If you can't test multiple real streams, at least reason about /
  temporarily fake a 2-session render to confirm it grows gracefully, then revert.
- Keep the HUD aesthetic and alignment with the rest of the page intact.

## VERIFY

- Build passes; `/`, `/sol`, `/media`, `/esports/player` all still 200; no console
  errors; no regression to the other five media panels or anything else.
- Screenshot `/media`: confirm (a) no inline red reason line by default, (b) reason
  reachable on hover of the TRANSCODE badge, (c) the empty gap under NOW PLAYING is
  gone with one stream.
- Confirm the "Nothing playing" empty state still looks intentional (compact, not
  broken) after the height change.
- Report with the screenshot.

## CONSTRAINTS

`components/media` (the now-playing component + its styles) only — this is CSS/markup,
no API/route/data changes, no new access. Don't touch the other panels' data,
Proxmox/SSH, sol routes, TTS, orb, or chat/esports logic.

Build it, screenshot, then STOP and report. After it's confirmed, remind the user to
commit + push (this can fold into the media commit if that hasn't been pushed yet).
