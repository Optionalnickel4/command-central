# GIVE THE ASSISTANT DASHBOARD AWARENESS — compact live context per message

PROBLEM: When the user asks Sol/Claude to detail an LXC (or anything about the
homelab, esports, or Sol's own stats), it says it CAN'T — because the chat route
forwards the user's message with NO dashboard data attached. Fix: assemble a
COMPACT live system snapshot and prepend it as context on every chat turn, for
WHICHEVER backend is active (Sol or Claude).

## WHAT TO ATTACH (compact — a digest, NOT raw JSON dumps)

Reuse the existing fetchers/routes (lib/pve.ts, the esports lib, the sol routes) —
DO NOT widen any SSH scope or add new secrets. Include:

- TIMESTAMP: current date/time.
- HOMELAB (Proxmox): node name, CPU%, RAM used/total, load avg; then a compact
  per-container list — id, name, status (up/down), IP, CPU%, mem%, uptime. One
  short line each.
- ALERTS: containers DOWN, high load, RAM near cap — explicitly, so the assistant
  can answer "is anything wrong?".
- ESPORTS: one-liner — live match or next upcoming with countdown, and top ranking.
- SOL STATS: one-liner — task success rate, session count, recent token usage.
- CAPABILITIES: a short line telling the assistant what it CAN answer about.

KEEP IT TIGHT. A few hundred tokens, not thousands — this rides on every turn.

## HOW TO WIRE IT

- In app/api/chat/route.ts, BEFORE dispatching, build the snapshot (parallel fetch,
  short timeout; a failing source becomes "unavailable" rather than failing chat).
- Prepend, clearly delimited:

      [SYSTEM CONTEXT — live dashboard snapshot, {timestamp}]
      {snapshot}
      [END CONTEXT]
      User: {the user's message}

  For SOL the text goes into the message string passed through the cc-agent
  wrapper. For CLAUDE prepend to the prompt the same way. Only the active backend
  needs it.
- Cache the snapshot briefly (5-10s).
- The user's question must stay clearly separated from the context.

## PRIVACY / SAFETY

- Operational data only (counts, states, LAN IPs, timings). NO secrets (tokens,
  gateway token, SSH keys) and NO Sol chat message CONTENT.
- Don't log the assembled snapshot to disk.

## VERIFY

- Build passes, site 200, no console errors.
- Ask "detail LXC 105" and confirm it answers with real status/IP/stats.
- Ask "is anything wrong with the homelab?" and confirm it uses the ALERTS line.
- Log the snapshot's char/token length — tune down if huge.
- Confirm a failing source degrades to "unavailable" without breaking chat.

## CONSTRAINTS

Reuse existing data routes; no new SSH scope, no new secrets. Don't touch the SSH
transports, Proxmox fetch, esports/sol route behaviour, TTS, or the orb.

Build it, self-verify, then STOP and report — include an example snapshot and size.
