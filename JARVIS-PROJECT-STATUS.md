# JARVIS PROJECT-STATUS CONTEXT — fetch PROJECTS.md from MewBot's box into the snapshot

PROBLEM: When asked "what's the status of <project>" (vlr-api, mrvl-api, etc.), the
assistant answers with live UPTIME ("operational, receiving fixtures") instead of
PROJECT LIFECYCLE (what phase it's in, what's shipped, what's next). Cause: the chat
route's context snapshot only carries live service health — it has no project-status
context at all. Fix: add a project-status section to the snapshot, sourced from the
canonical PROJECTS.md that lives on the MewBot box.

SOURCE OF TRUTH: /root/.openclaw/workspace/PROJECTS.md on LXC 152 (10.0.0.152) — the
same box the Sol backend and /sol stats already SSH into. It's a ~15KB markdown file
describing all active projects and their status. We fetch it so there's ONE source of
truth (edited once on 152, both MewBot and this dashboard reflect it).

=== TRANSPORT — a THIRD scoped SSH wrapper (reuse the proven pattern) ===
PROJECTS.md is a FILE on 152, not an HTTP endpoint — so read it over SSH, exactly like
cc-agent (Sol chat) and cc-stats (/sol stats) already do. Add a THIRD wrapper:
- New dedicated key (e.g. cc_projects), separate from the cc-agent and cc-stats keys —
  do NOT reuse or widen either existing key.
- On 152, authorized_keys command= locks this key to EXACTLY ONE invocation:
  `cat /root/.openclaw/workspace/PROJECTS.md` — nothing else. Same hardening as
  cc-stats: no-port-forwarding, no-agent-forwarding, no-pty, no-user-rc. The allowlist
  IS the security — it can read that one file and do nothing else.
- Verify the wrapper rejects anything other than the exact cat (e.g. `cat /etc/passwd`,
  `cat PROJECTS.md; rm -rf /`, bare shell) — same rejection test cc-stats got.
- Store the key path in .env.local (e.g. PROJECTS_SSH_KEY), never commit it. Add a
  placeholder to .env.example.

NOTE: you (Claude Code on 220) will need the user to create the keypair + install the
authorized_keys entry on 152, OR provide exact commands for the user to run on 152 —
you can't add an authorized_keys entry on 152 yourself. Produce the 152-side setup
commands for the user (keygen, the command= line to paste), and wire the 220 side to
use the key. Follow how cc-stats was set up — mirror it.

=== SNAPSHOT INTEGRATION (lib/context-snapshot.ts) ===
- Add a PROJECT STATUS section to the snapshot the chat route already builds (alongside
  homelab/esports/sol). Fetch PROJECTS.md via the cc-projects SSH wrapper.
- CACHE IT: the snapshot is built on EVERY chat message — do NOT SSH to 152 every turn.
  Cache the fetched content in-process with a 5-10 minute TTL; only re-fetch when stale.
- SHORT TIMEOUT + GRACEFUL DEGRADATION: cap the SSH fetch at a few seconds. If it times
  out or fails, use the last cached copy; if there's no cache, OMIT the project-status
  section entirely and continue — a slow/down 152 must NEVER hang or break chat. Same
  discipline as the media panels' per-service isolation.
- TRIM FOR TOKENS: PROJECTS.md is ~15KB. Do NOT inject all 15KB into every turn's
  context. Inject a summarized/trimmed version — the per-project status lines, not the
  full architectural detail. Options: (a) extract just section headers + the first
  status sentence(s) per project, or (b) cap total injected length (e.g. ~2KB) with a
  note that fuller detail exists. Keep it compact like the esports snapshot slice.
- The assistant should treat this as PROJECT STATUS (lifecycle/phase/next-steps),
  distinct from the live-health data already in the snapshot. A short header like
  "PROJECT STATUS (lifecycle, not live health):" helps it not conflate the two.

=== VERIFY (you can test end-to-end — 152 is reachable, Sol/Claude answer) ===
- Show the cc-projects wrapper rejecting a non-allowlisted command AND succeeding on the
  exact cat (the receipts).
- Build passes; /, /sol, /esports/player, /media all still 200; no console errors; no
  regression to existing snapshot sections (homelab/esports/sol still work).
- Ask the assistant (current backend) "what's the status of mrvl-api?" — confirm it now
  answers LIFECYCLE (mid-build, foundation shipped, next = ops dashboard → rating →
  public frontend) NOT uptime. Then ask "what's vlr-api's status?" — should answer
  shipped/stable/maintenance, not "operational".
- Confirm the cache works (second question in the same window doesn't re-SSH) and that
  simulating a fetch failure (e.g. temporarily wrong key path) degrades to "no project
  status available" without breaking chat.
- Paste the real assistant answers.

CONSTRAINTS: chat route + lib/context-snapshot.ts + a new SSH helper (mirror lib/sol.ts
or however cc-stats SSH is wrapped) + .env.local/.env.example. Do NOT touch the Proxmox
fetch, the cc-agent or cc-stats keys/wrappers, TTS, the orb, or the esports/vlr lookup
logic. New key + new wrapper only; existing transports untouched.

Build it, verify with the real status questions + the wrapper rejection test, then STOP
and report. After it's confirmed, remind the user to commit + push.
