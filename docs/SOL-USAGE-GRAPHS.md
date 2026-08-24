# LIVE USAGE GRAPHS ON /sol — stored history + live per-turn layer

Sol's OpenAI quota is back and the SOL backend replies again (confirmed). Build the
live usage analytics we deferred. TWO data layers:

BACKBONE = OpenClaw's stored history (already have it via the cc-stats wrapper:
sessions --json carries per-session token usage; audit --json carries the run
event stream with timestamps + status).

LIVE LAYER = the per-turn --json meta that comes back through the cc-agent
wrapper on EVERY Sol reply (durationMs, usage{input,output,total},
contextTokens, lastCallUsage{cacheRead,cacheWrite}). Layer the current session's
live turns on top of the historical backbone so the graph updates in real time as
you chat.

## DATA

1. BACKBONE (historical, no new access — reuse existing /api/sol/sessions + audit):
   - From sessions: per-session totalTokens / input / output, model, timestamps →
     a usage-over-time series (sessions ordered by sessionStartedAt) and totals.
   - From audit: run events over time → runs/day (or /hour), success vs failed.
   - Compute aggregates: total tokens, avg tokens/session, success rate trend.

2. LIVE LAYER (current session, real-time):
   - The chat route already receives the agent --json meta per reply. Capture each
     turn's {timestamp, durationMs (latency), inputTokens, outputTokens, totalTokens,
     contextTokens, cacheRead, cacheWrite} and append to a rolling in-memory series
     the /sol page can read.
   - PERSIST it so it survives reloads/restarts: append each turn as a line to a
     small JSONL file on 220 (e.g. /home/builder/command-central/data/usage.jsonl —
     make sure that dir is gitignored; it's runtime data, not code). A new
     /api/sol/usage route reads recent lines back. Keep it bounded (cap file size /
     rotate, e.g. last N turns) so it can't grow forever.
   - This means the live layer ALSO becomes history over time — the JSONL is the
     dashboard's own record, complementing OpenClaw's.

## GRAPHS (hand-rolled SVG to match the HUD — recharts is NOT installed)

Add a "USAGE" section. Suggested charts:
- Tokens per turn (input vs output stacked, over the recent turns).
- Latency distribution / latency-per-turn (durationMs) — a line or histogram.
- Context growth — contextTokens over the session (how the window fills).
- Cache-hit ratio — cacheRead vs total, over turns (Sol's cache efficiency).
- Historical backbone: tokens-over-time across sessions + runs success/fail trend.

Label clearly what's HISTORICAL (from OpenClaw) vs THIS SESSION (live). A small
"live" indicator when a new turn just landed is a nice touch.

## PLACEMENT (your call, per the user)

Fits best as a new USAGE section on the existing /sol page (it's the natural home —
same data family as the Sessions/Activity panels already there). Use judgment; keep
the page legible and not overwhelming — a tabbed or clearly-sectioned layout if it's
getting long.

## CONSTRAINTS / PRIVACY

- Reuse the cc-stats + cc-agent paths that exist; DON'T widen either SSH wrapper.
- Same privacy rules as the rest of /sol: counts/aggregates/timings only — never
  message content, tokens (the secret kind), IPs, or fs paths. The usage meta is all
  numeric, so this is easy — just don't log prompt/response text into usage.jsonl.
- force-dynamic on the new route. Keep the JSONL bounded + gitignored.
- Don't touch Proxmox path, chat backend transport, esports, TTS/voice, the orb.

## VERIFY (you have a browser; Sol answers now so you can generate live data)

- Build passes, /sol 200, no console errors, existing panels still healthy.
- Send a few Sol messages; confirm each appends a turn to usage.jsonl and the live
  charts update. Confirm the historical backbone renders from sessions/audit.
- Confirm usage.jsonl is gitignored and bounded, and contains NO message text.
- Screenshot the USAGE section and confirm it's legible.

Build it, self-verify with real Sol turns, then STOP and report.
