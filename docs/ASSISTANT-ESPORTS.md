# ESPORTS DEEP-DIVE FOR THE ASSISTANT — on-demand vlr-api lookup + richer snapshot

The assistant already gets a compact dashboard snapshot per turn (homelab/esports/
sol). The user wants it to go DEEP on esports: (1) a richer always-on esports slice
in the snapshot, AND (2) an ON-DEMAND lookup so it can pull ANYTHING vlr-api exposes
for a specific team / player / match / ranking the user asks about.

vlr-api is LAN-reachable at 10.0.0.21:8000 (VLR_API_URL in .env.local), already used
by the esports panels — NO new access needed. But RE-CURL each endpoint you wire to
confirm its real shape; do NOT assume from memory. Known past quirks: live matches
have NO map field; /stats uses a {data,stale,error} envelope (not a bare array);
/rankings is 13 concatenated per-region top-10 blocks (ranks repeat 1-10, region via
?region=). Verify current shapes before parsing.

## PART 1 — RICHER SNAPSHOT SLICE

Widen the esports section of the per-turn context snapshot (keep it still reasonably
compact — a handful of lines, not a dump): live match(es) + score, next 2-3 upcoming
with times, top ~5 of the main ranking, maybe last 2-3 results.

## PART 2 — ON-DEMAND vlr-api LOOKUP (the main ask)

- ONE lookup round-trip per turn (fetch → answer), not open-ended chains.
- Works for the ACTIVE backend (Sol via cc-agent message string, Claude via claude -p).
- Detect intent via either (a) keyword/entity parse, or (b) a cheap pre-pass asking
  the backend for JSON like {"lookup":"player","query":"TenZ"} or {"lookup":"none"},
  STRICT-parsed with fallback to "no lookup".
- Endpoints to support (curl each first): matches live/upcoming/results (+ detail by
  id), players search/profile/stats + /players/{id}/dimensions, teams results,
  rankings by region, stats leaders, and anything else vlr-api exposes.
- Unknown player/typo → say so gracefully, never fabricate.
- Short timeout; if vlr-api is down the assistant still answers.

## PRIVACY / SAFETY

Public esports data. Don't leak internal tokens/paths; don't log message content to
disk. No SSH scope changes — HTTP to vlr-api only.

## VERIFY

- Build passes, / and /sol 200, no console errors, homelab/esports/sol/TTS healthy.
- Specific question needing a lookup → real data, not "I can't", not hallucination.
- Broad "what's happening in esports" → answered from the richer snapshot.
- Nonsense player → says no result.
- Log an example round-trip (intent → endpoint → answer) and the snapshot size.
- Report the actual assistant answers.

## CONSTRAINTS

Chat route + a vlr lookup helper (extend lib/vlr.ts). Reuse existing vlr access.
Don't touch Proxmox, SSH transports, the sol routes, TTS, or the orb. Keep the
single lookup round-trip bounded.

Build it, verify end-to-end, then STOP and report. Remind the user to commit + push.
