# PHASE 4 — VOICE with SELF-HOSTED PIPER TTS (custom voice, not Windows)

GOAL: The assistant speaks its replies aloud in a CUSTOM, better-than-Windows
voice — self-hosted, local, private. Use Piper TTS running on THIS box (LXC 220).
The user wants an expressive / anime-leaning voice, not robotic OS voices. Also
add a push-to-talk mic button that stays DORMANT until HTTPS (see gating note).

## PART A — STAND UP PIPER (local TTS service)

Piper is a fast local neural TTS. Install it and a voice model on this box, and
expose it as a tiny local HTTP service the dashboard can POST text to.

- Install Piper. The pip package `piper-tts` is the simplest path; if it needs
  system libs the builder user can't apt-install, STOP and give the user the
  exact root command (like the Playwright deps step).
- Download a voice model (.onnx + .onnx.json) from the Piper voices library.
  Pick a bright/expressive English voice as the default — browse what's
  available and choose the most characterful one (the user wants anime-ish
  energy; a higher, lively voice beats a flat news-anchor one). Put models in a
  known dir, e.g. /home/builder/piper-voices/.
- Wrap Piper in a minimal local HTTP service (a small Python/FastAPI or Node
  script, its own systemd unit, bound to 127.0.0.1 only — it never needs to
  leave the box): POST {text} -> returns audio (WAV). Keep it simple and cached
  where sensible. Give it its own systemd service so it survives reboots.
- IMPORTANT: this is a NEW service. Don't fold it into the Next app's systemd
  unit. Bind to localhost; the Next app (also on this box) reaches it locally.

## PART B — WIRE IT INTO THE DASHBOARD

- New server-side route `app/api/tts` (force-dynamic): takes reply text, calls the
  local Piper service, streams/returns the audio to the browser. Keep Piper's
  address in an env var (e.g. PIPER_URL=http://127.0.0.1:PORT). Browser never
  talks to Piper directly — same pattern as the other data sources.
- When the assistant returns a reply (EITHER Sol or Claude backend), fetch TTS
  audio from /api/tts and play it in the browser (Audio element / Web Audio).
- Tie the orb's "speaking" state to actual audio playback (onplay/onended), so
  the orb pulses in sync with the voice. If that risks destabilising the orb
  lifecycle, keep independent and note it.
- Voice on/off toggle in the console header (HUD style, near Sol/Claude toggle),
  React state (no localStorage). Cancel/stop current audio if a new message is
  sent mid-playback.
- If Piper/the TTS route is unreachable, fail SILENTLY (just no audio) — never
  block or break the text reply. Show a small "voice offline" hint at most.

## PART C — PUSH-TO-TALK MIC (wired, dormant until HTTPS)

- Mic button in the console input (HUD style), push-to-talk: click, speak, drop
  transcript into input and send (same single send path).
- Uses webkitSpeechRecognition. On load, check `window.isSecureContext`; under our
  current HTTP it will be false, so render the mic DISABLED with a tooltip:
  "Voice input needs HTTPS — available once the dashboard is served securely."
  Make the gated state intentional, not broken. It should just work later under
  HTTPS with no code change.

## VERIFY

- Piper service: curl it with sample text, confirm it returns real audio bytes
  (check WAV header / non-empty). Report timing (Piper is usually sub-second for
  a sentence on CPU).
- Build passes, site 200, no console errors, existing chat/orb/esports all fine.
- TTS wiring: confirm /api/tts returns audio and the play path fires on a real
  reply (orb enters speaking state). NOTE: headless Chromium likely has no audio
  output, so you can confirm the AUDIO BYTES and the code path but NOT hear it —
  the user will confirm sound over RustDesk. Say clearly what you could and
  couldn't verify.
- Mic button renders in the gated/disabled state under HTTP with its tooltip.

## CONSTRAINTS

Don't touch the Proxmox path, the SSH-to-Sol transport, the chat backends' server
logic, or the esports routes. New Piper service is separate. Keep the single send
path. prefers-reduced-motion respected.

Do PART A first (stand up Piper and confirm it produces audio via curl) and
report before wiring the UI — if Piper install hits a system-deps wall, that's
the thing to surface early. Then B and C, then STOP and report, separating
"confirmed" from "needs the user's ears / HTTPS."
