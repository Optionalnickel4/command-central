# DISCOVER OPENCLAW STATS SURFACE (discovery only — don't build the page yet)

GOAL: The user wants a dedicated, richly-detailed OpenClaw/Sol STATS PAGE (its
own route, a button from the main dashboard to reach it, a button back). Before
building anything, find out what OpenClaw actually exposes so the page is
designed around REAL data, not assumptions. THIS TASK IS DISCOVERY ONLY —
produce a menu of available stats and STOP. Do not build the page. Do not widen
the SSH key yet.

## CONTEXT

- OpenClaw runs on LXC 152 (10.0.0.152). Version 2026.7.1-2.
- The dashboard reaches Sol via an SSH key restricted (authorized_keys command=)
  to ONE wrapper: `/usr/local/bin/cc-agent`, which only runs
  `openclaw agent -m <msg> --json --session-id command-central`.
- The gateway listens on 10.0.0.152:18789 (serves a control UI; /health, /status
  seen earlier). The openclaw CLI has many subcommands: agent, agents, audit,
  channels, capability, commitments, config, approvals, etc.
- Sol's own model is gpt-5.6-sol (provider openai). Per-turn agent --json meta
  includes: runId, status, durationMs, provider, model, sessionId, contextTokens,
  usage {input, output, total}, lastCallUsage {input, output, cacheRead,
  cacheWrite, total}, promptTokens. (This half is real but only appears when Sol
  answers — Sol is currently down on OpenAI quota until Saturday.)

## WHAT TO DO

All READ-ONLY probing; you may need the user to run some directly on LXC 152
since the current key can't.

1. Enumerate READ-ONLY CLI stats. For each promising subcommand, run its --help
   and, where safe/read-only, a sample invocation WITH --json if supported.
   Focus on things that yield STATS about OpenClaw itself, e.g.:
   - `openclaw status` / `openclaw --version`
   - `openclaw agents ...` (list/describe configured agents)
   - `openclaw channels ...` (connected chat channels + accounts)
   - `openclaw audit ...` (run/tool-action records — how much history?)
   - `openclaw commitments ...` (inferred follow-ups)
   - `openclaw capability ...` (provider capability info)
   - `openclaw config get ...` (non-secret config: enabled skills, MCP servers)
   - anything else that looks stat-bearing. Note which support --json.

2. Enumerate GATEWAY HTTP endpoints on :18789 that return DATA (not the control
   UI HTML). Try /health, /status, and probe for any JSON stats/metrics routes.
   Report status codes and whether the body is JSON or the SPA HTML shell.

3. For EACH data source you find, record: the exact command/endpoint, whether
   it needs auth, whether it supports --json, a 1-line description of what stats
   it gives, and a small sample of the real shape (redact anything sensitive —
   tokens, secrets, private message content).

4. Note anything SENSITIVE that shows up (message contents, credentials, private
   data) so we can deliberately EXCLUDE it from a stats page.

## DELIVERABLE

A written MENU — "here's every OpenClaw stat we could surface, the source for
each, how detailed, and whether it's live-now or needs Sol up." Group into:
(A) system/config stats (available now), (B) live agent/usage stats (need Sol
up, Saturday), (C) history/audit stats. Then STOP.

## DO NOT

Build the stats page, change the SSH wrapper/key, restart the dashboard, or
touch the Proxmox path, chat backends, esports, or TTS. This is reconnaissance
so we can design the page around what's actually there. Report the menu and wait.
