# ADD CLAUDE AS A SECOND ASSISTANT BACKEND (with a Sol/Claude toggle)

GOAL: I'm out of OpenAI quota until Saturday, so Sol can't reply — which means I
can't see the orb's reactive states (thinking/speaking). Add Claude as an
ALTERNATE assistant backend so the chat works now AND I can watch the orb react.
Keep Sol fully intact; add a toggle to pick which backend answers.

## STEP 0 — VERIFY AUTH FIRST (don't build on an assumption)

This box has Claude Code installed and logged in via a Pro/Max subscription (as
the builder user). Before writing any app code, confirm headless Claude works
when invoked the way the service will invoke it:

    claude -p "reply with just: ok"

Run it as the builder user. If it returns a reply, great — use this "CLI"
approach. If it errors about auth/credentials (the systemd service runs as
builder but may not inherit the login), then STOP and tell me — we'll either
point it at the right config/home dir or fall back to an ANTHROPIC_API_KEY in
.env.local (I can paste a key). Do not silently pick one; report what you found.

## STEP 1 — BACKEND

Refactor `app/api/chat/route.ts` to support TWO backends behind one interface:

- **"sol"** → the EXISTING SSH-to-OpenClaw path. DO NOT change its transport.
- **"claude"** → headless Claude. If STEP 0's CLI approach worked, shell out to
  `claude -p <message>` (use execFile, no shell interpolation of the user's
  text — pass it as an arg, with a timeout, like the SSH call does). If instead
  we go the API-key route, call the Anthropic API with ANTHROPIC_API_KEY from
  .env.local and model claude-sonnet-4-6.

The request from the client includes which backend to use; default to whichever
you confirmed works. Both return the same `{reply}` shape the UI already expects,
so the orb's thinking/speaking/error lifecycle works identically for both.

## STEP 2 — UI TOGGLE

Add a small toggle in the assistant/core-console area to pick "SOL" or "CLAUDE"
(HUD style, matching the cockpit). The selected backend is what the console AND
the command-bar input route to. Persist the choice in component state (not
localStorage — that's blocked in this environment per earlier notes; React
state is fine). Label the orb/console subtly with the active backend so it's
clear who's answering.

## STEP 3 — VERIFY

- `npm run build` passes.
- With CLAUDE selected, sending a message returns a real reply, and the ORB
  visibly goes through its thinking → speaking → idle states (this is the whole
  point — confirm the orb animates on a real round-trip).
- With SOL selected, behavior is unchanged (still errors until my quota's back;
  that's expected).
- `sudo systemctl restart command-central`, site serves 200.

## CONSTRAINTS

Don't touch the Proxmox path or the SSH-to-Sol transport. Keep the
single-path-to-each-backend discipline. Report anything you couldn't verify
without a browser (e.g. whether the orb's states actually read well on a real
reply — I'll watch that myself).

Do STEP 0 and report before building the rest, since it decides the approach.
