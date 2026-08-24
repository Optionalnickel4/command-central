# BUILD THE OPENCLAW STATS PAGE (/sol) + cc-stats SSH WRAPPER

Discovery is done (see OPENCLAW-STATS-MENU.md). Build a dedicated, detailed
OpenClaw/Sol stats PAGE. Good news: the data is real and available NOW — it does
NOT need Sol to be up. Sessions and audit carry stored history.

## STEP 1 — cc-stats SSH WRAPPER (new, read-only, tightly scoped)

On OpenClaw (LXC 152) we'll add a SECOND restricted SSH setup, SEPARATE from the
cc-agent key. The user will run the root parts on 152 — you generate the keypair
on LXC 220 and give the user the exact authorized_keys line + wrapper to install.

- Generate a new dedicated keypair on 220 (e.g. /home/builder/.ssh/openclaw_stats),
  separate from openclaw_agent. Give the user the PUBLIC key.
- Provide the user a wrapper /usr/local/bin/cc-stats for LXC 152 that runs ONLY a
  fixed allowlist of read-only commands, chosen by a first argument, NOT arbitrary
  input. Exactly these four, nothing else:

      status      -> openclaw status --json
      sessions    -> openclaw sessions --json
      audit       -> openclaw audit --json --limit 100
      capability  -> openclaw capability list

  The wrapper must reject anything not in the allowlist (case-exact), and must NOT
  pass user-supplied text through to openclaw. This matters: many openclaw
  subcommands have WRITE forms (agents add/delete, cron add/rm/run, config
  set/patch, commitments dismiss, tasks cancel) — the wrapper must make those
  unreachable. The allowlist is the whole security model here.
- Provide the authorized_keys line (command="/usr/local/bin/cc-stats
  $SSH_ORIGINAL_COMMAND",no-port-forwarding,no-X11-forwarding,no-pty <pubkey>)
  for the user to add on 152. DO NOT touch the existing cc-agent key/line.
- Add OPENCLAW_STATS_KEY + OPENCLAW_SSH_HOST(existing) to .env.local as needed.

## STEP 2 — SERVER-SIDE ROUTES

- app/api/sol/status | sessions | audit | capability (force-dynamic). Each SSHes
  to 10.0.0.152 with the openclaw_stats key, passing ONLY the allowlist keyword
  (status|sessions|audit|capability), parses the JSON, returns it (shaped/trimmed).
- Poll intervals: status ~30s, sessions/audit ~60s, capability ~10m (rarely
  changes). Cache server-side where sensible.
- EXCLUDE sensitive fields even if present: no message bodies, no tokens/secrets,
  no instance hosts/IPs, no pairing tokens, no session file paths that leak fs
  layout (a session KEY/id is fine; the absolute .jsonl path isn't needed).
  Counts and aggregates yes; content no.

## STEP 3 — THE /sol PAGE

- A new full route at /sol (Next app router page). Match the JARVIS HUD aesthetic
  (reuse the existing style system, panels, glow, mono type).
- A clear BUTTON on the main dashboard (e.g. in the command bar or near the Sol
  orb/console) that navigates to /sol. A BUTTON on /sol to go BACK to the main
  dashboard. Use Next <Link>/router — no full reloads.
- Make it DETAILED. Suggested panels from the confirmed data:
  - Overview: runtimeVersion, agent (main / MewBot), heartbeat interval, uptime.
  - Tasks (from status): total/active/terminal, success vs failure (the sample
    had 58 total, 28 ok / 30 failed — show the ratio prominently), byRuntime
    breakdown (subagent/cli/cron) as a chart, byStatus breakdown.
  - Sessions (from sessions): count, per-session token usage (input/output/total)
    as bars or a table, model distribution, success/failed status, direct vs cron
    kind, recency. Aggregate totals across all sessions.
  - Activity timeline (from audit): recent agent.run started/finished events over
    time, success vs failed, error codes surfaced as counts.
  - Capabilities (from capability): the model.* catalog as a clean list/grid.
- Graphs/charts encouraged (recharts is available). Respect reduced-motion.
- Handle Sol/link DOWN gracefully: if a route fails, that panel shows an offline
  state; the page still renders the panels that work. (status/sessions/audit are
  stored data, so most should work even with Sol's OpenAI quota down.)

## VERIFY (use your browser + curl)

- cc-stats wrapper rejects a non-allowlisted arg (test e.g. ... "agents" fails)
  and allows the four. Confirm from 220 over the new key.
- Each /api/sol/* returns real JSON. The /sol page renders with real data. Nav
  button both ways works. Build passes, main dashboard unaffected, no console
  errors. Screenshot /sol and confirm it's detailed and legible.

## CONSTRAINTS

Don't touch the cc-agent key, the Proxmox path, chat backends, esports, or TTS.
The new stats access is a SEPARATE key + wrapper, read-only, allowlisted. Report,
separating confirmed-working from anything needing the user.

Do STEP 1 (wrapper + key) and give the user the exact 152-side commands to run
FIRST; you can't install the wrapper on 152 yourself. Once the user confirms the
key works from 220, do STEP 2 and 3, then STOP and report.
